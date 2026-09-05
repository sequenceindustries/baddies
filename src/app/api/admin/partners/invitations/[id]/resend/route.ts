import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { sendPartnerInviteEmail } from "@/lib/notifications/partner-invite";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Re-sends the invite email with a freshly-signed token (the original
 * token still verifies too, since the row's expiresAt is unchanged here
 * — this is purely "in case the email got lost," not a token rotation).
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
    return NextResponse.json({ error: `Cannot resend an invitation with status "${invitation.status}".` }, { status: 409 });
  }
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "This invitation has already expired." }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.partnerInvitation.update({
      where: { id: invitation.id },
      data: { resentAt: new Date(), resendCount: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_partner.invite_resent",
        targetType: "partner_invitation",
        targetId: invitation.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return result;
  });

  const ttlSeconds = invitation.expiresAt
    ? Math.max(Math.floor((invitation.expiresAt.getTime() - Date.now()) / 1000), 1)
    : undefined;
  try {
    await sendPartnerInviteEmail(invitation.id, invitation.email, invitation.expiresAt, ttlSeconds);
  } catch (err) {
    console.error("[partner-invitations] resend email failed", err);
  }

  return NextResponse.json({ invitationId: updated.id, resendCount: updated.resendCount });
}
