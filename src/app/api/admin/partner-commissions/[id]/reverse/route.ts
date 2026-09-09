import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { postManualCommissionReversal } from "@/lib/ledger/service";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const ReverseSchema = z.object({
  reason: z.string().min(3, "A reason is required.").max(1000),
  // Optional — defaults to the full remaining balance (see
  // postManualCommissionReversal's own comment).
  amountUsd: z.number().positive().optional(),
});

/**
 * Manually reverses a commission believed to be fraudulent (spec §8/
 * §10) — a direct admin action, not tied to any specific refund/
 * chargeback event (see postCommissionReversalEvent for the automatic
 * webhook-driven path). Every manual adjustment is logged with actor,
 * timestamp, reason, and amount before/after (spec §8).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "founding_partner:manage");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = ReverseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const commission = await db.partnerCommission.findUnique({ where: { id: params.id } });
  if (!commission) {
    return NextResponse.json({ error: "Commission not found." }, { status: 404 });
  }
  const remainingBeforeUsd = Number(commission.commissionAmountUsd) - Number(commission.reversedAmountUsd);
  if (remainingBeforeUsd <= 0) {
    return NextResponse.json({ error: "This commission has already been fully reversed." }, { status: 409 });
  }

  const reversalEntry = await postManualCommissionReversal({
    commissionId: commission.id,
    amountUsd: parsed.data.amountUsd,
    reason: parsed.data.reason,
  });
  if (!reversalEntry) {
    return NextResponse.json({ error: "Nothing to reverse." }, { status: 409 });
  }

  const updated = await db.partnerCommission.findUniqueOrThrow({ where: { id: commission.id } });
  const remainingAfterUsd = Number(updated.commissionAmountUsd) - Number(updated.reversedAmountUsd);

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "partner_commission.reversed",
      targetType: "partner_commission",
      targetId: commission.id,
      metadata: {
        reason: parsed.data.reason,
        amountBeforeUsd: remainingBeforeUsd,
        amountAfterUsd: remainingAfterUsd,
        reversalEntryId: reversalEntry.id,
      },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status, reversedAmountUsd: Number(updated.reversedAmountUsd) });
}
