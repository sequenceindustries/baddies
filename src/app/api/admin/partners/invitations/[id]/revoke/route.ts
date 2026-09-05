import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Revoking is what actually stops an invitation dead — the row's own
 * status is the source of truth checked at accept time (see
 * PartnerInvitation's schema comment), so this takes effect immediately
 * regardless of what a still-outstanding mailed link claims.
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

  const invitation = await db.partnerInvitation.findUnique({ where: { id: params.id } });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: `Cannot revoke an invitation with status "${invitation.status}".` }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.partnerInvitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedBy: user.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_partner.invite_revoked",
        targetType: "partner_invitation",
        targetId: invitation.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return result;
  });

  return NextResponse.json({ invitationId: updated.id, status: updated.status });
}
