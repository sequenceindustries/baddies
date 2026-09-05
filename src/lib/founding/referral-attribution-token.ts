import { SignJWT, jwtVerify } from "jose";

/**
 * Signs the value stored in the `baddies_referral` httpOnly cookie set
 * when a visitor loads /founding-baddies?ref=<code> for a valid, active
 * Founding Partner referral code — never a raw, tamperable
 * `foundingPartnerId` cookie. Same jose SignJWT/jwtVerify-against-
 * AUTH_SECRET primitive and own-purpose-tag convention as every other
 * founding/* token module; a fixed TTL (unlike partner-invite-token.ts)
 * since there's no per-referral configuration to honour here, just a
 * generous window for a visitor to browse and decide before applying.
 *
 * Verified server-side only at the moment POST /api/founding/apply
 * creates the FoundingApplication (wired in a later phase) — the cookie
 * itself grants no access to anything, it only proves which partner (if
 * any) should be credited with the resulting application.
 */
const PURPOSE = "referral_attribution";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment — never commit real secrets."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createReferralAttributionToken(foundingPartnerId: string): Promise<string> {
  return new SignJWT({ foundingPartnerId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns the foundingPartnerId if the token is valid, unexpired, and carries the right purpose — null otherwise (never throws). Callers must still confirm the FoundingPartner row is ACTIVE before attributing. */
export async function verifyReferralAttributionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== PURPOSE || typeof payload.foundingPartnerId !== "string") return null;
    return payload.foundingPartnerId;
  } catch {
    return null;
  }
}
