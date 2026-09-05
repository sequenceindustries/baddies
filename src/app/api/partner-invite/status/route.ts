import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { verifyPartnerInviteToken } from "@/lib/founding/partner-invite-token";

// Always dynamic: reads live data (DB) and depends on a query param.
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated by design — same reasoning as every other
 * founding/* token-gated read: a mailed link has no session yet. Returns
 * enough for the accept-invite page to render the right state (valid +
 * agreement text, or a specific reason it can't proceed) without ever
 * exposing the invitation id itself or another invitee's email.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ valid: false, reason: "missing_token" });
  }

  const invitationId = await verifyPartnerInviteToken(token);
  if (!invitationId) {
    return NextResponse.json({ valid: false, reason: "invalid_token" });
  }

  const invitation = await db.partnerInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation) {
    return NextResponse.json({ valid: false, reason: "invalid_token" });
  }
  if (invitation.status === "ACCEPTED") {
    return NextResponse.json({ valid: false, reason: "already_accepted" });
  }
  if (invitation.status === "REVOKED") {
    return NextResponse.json({ valid: false, reason: "revoked" });
  }
  if (invitation.status === "EXPIRED" || (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now())) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }

  const agreement = await db.agreement.findFirst({
    where: { type: "PARTNER_AGREEMENT" },
    orderBy: { effectiveAt: "desc" },
  });
  if (!agreement) {
    // Genuinely shouldn't happen outside a broken seed — fail loud rather
    // than let someone accept without ever seeing an agreement.
    return NextResponse.json({ valid: false, reason: "agreement_unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    valid: true,
    email: invitation.email,
    agreement: { title: agreement.title, version: agreement.version, bodyText: agreement.bodyText },
  });
}
