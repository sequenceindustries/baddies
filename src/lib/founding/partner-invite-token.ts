import { SignJWT, jwtVerify } from "jose";

/**
 * Same primitive as src/lib/founding/email-verification.ts and
 * onboarding-token.ts (jose SignJWT/jwtVerify against AUTH_SECRET), own
 * purpose tag, separate module per that same established convention
 * (small, obviously distinct, easier to audit than one generic helper).
 *
 * Diverges from the other two in one deliberate way: its TTL is NOT a
 * fixed module-level constant. An admin sets (or leaves open) an
 * `expiresAt` on the PartnerInvitation row itself when creating the
 * invite, so the token's own `exp` claim is derived from that row at
 * creation time (defaulting to 14 days if the admin left it open) —
 * this is only ever a courtesy, though: the row's own `status`/
 * `expiresAt` (which admin revocation/expiry updates directly) is
 * always re-checked at accept time regardless of what this token
 * claims, exactly like PartnerInvitation's own schema comment describes.
 */
const PURPOSE = "partner_invite";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days, used only when the invitation has no explicit expiresAt

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment — never commit real secrets."
    );
  }
  return new TextEncoder().encode(secret);
}

/** ttlSeconds should come from the invitation's own expiresAt (if set) minus now; pass undefined to use the 14-day default. */
export async function createPartnerInviteToken(
  invitationId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  return new SignJWT({ invitationId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(ttlSeconds, 1)}s`)
    .sign(getSecretKey());
}

/** Returns the invitationId if the token is valid, unexpired, and carries the right purpose — null otherwise (never throws). Callers must still re-check the PartnerInvitation row's own status/expiresAt; this only proves the link itself hasn't been tampered with. */
export async function verifyPartnerInviteToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== PURPOSE || typeof payload.invitationId !== "string") return null;
    return payload.invitationId;
  } catch {
    return null;
  }
}
