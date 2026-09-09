import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const HoldSchema = z.object({
  reason: z.string().min(3, "A reason is required.").max(1000),
});

/**
 * Holds a PENDING commission for investigation (spec §9/§10 — review/
 * hold, never automatic confiscation). Every manual adjustment is
 * logged with actor, timestamp, reason, and amount before/after (spec
 * §8) — here the amount doesn't change on hold itself, so before/after
 * are the same commissionAmountUsd, recorded for a consistent audit
 * shape across hold/release/reverse.
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
  const parsed = HoldSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const commission = await db.partnerCommission.findUnique({ where: { id: params.id } });
  if (!commission) {
    return NextResponse.json({ error: "Commission not found." }, { status: 404 });
  }
  if (commission.status !== "PENDING") {
    return NextResponse.json({ error: `Only a PENDING commission can be held (this one is ${commission.status}).` }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.partnerCommission.update({
      where: { id: commission.id },
      data: { status: "HELD", heldBy: user.id, heldReason: parsed.data.reason, heldAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "partner_commission.held",
        targetType: "partner_commission",
        targetId: commission.id,
        metadata: {
          reason: parsed.data.reason,
          amountBeforeUsd: Number(commission.commissionAmountUsd),
          amountAfterUsd: Number(commission.commissionAmountUsd),
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return result;
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
