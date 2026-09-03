import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  status: z.enum(["REQUESTED", "APPROVED", "PROCESSING", "PAID", "FAILED", "REVERSED"]),
  failureReason: z.string().max(2000).nullable().optional(),
});

/**
 * Advances a payout beyond the one-click REQUESTED → APPROVED the
 * dedicated /approve route already handles — Processing/Paid/Failed/
 * Reversed had no route at all before this. No dedicated state-machine
 * file exists for Payout (unlike Content/Creator), so this trusts
 * admin discretion, same as the Founding Applications status dropdown.
 */
export async function PATCH(req: NextRequest, { params }: { params: { payoutId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "payout:approve");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.payout.findUnique({ where: { id: params.payoutId } });
  if (!existing) {
    return NextResponse.json({ error: "Payout not found." }, { status: 404 });
  }

  const { status, failureReason } = parsed.data;
  const isTerminal = status === "PAID" || status === "FAILED" || status === "REVERSED";

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.payout.update({
      where: { id: existing.id },
      data: {
        status,
        ...(failureReason !== undefined ? { failureReason } : {}),
        ...(isTerminal && !existing.processedAt ? { processedAt: new Date() } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "payout.status_change",
        targetType: "payout",
        targetId: existing.id,
        metadata: { from: existing.status, to: status, failureReason: failureReason ?? undefined },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return result;
  });

  return NextResponse.json({ payoutId: updated.id, status: updated.status });
}
