import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Suspension ends future referral attribution and profit-pool
 * eligibility going forward — it does not undo attributions already
 * recorded (see the Founding Partner Agreement, §7).
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

  const partner = await db.foundingPartner.findUnique({ where: { id: params.id } });
  if (!partner) {
    return NextResponse.json({ error: "Founding Partner not found." }, { status: 404 });
  }
  if (partner.status !== "ACTIVE") {
    return NextResponse.json({ error: "This partner is already suspended." }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.foundingPartner.update({
      where: { id: partner.id },
      data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedBy: user.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_partner.suspended",
        targetType: "founding_partner",
        targetId: partner.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return result;
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
