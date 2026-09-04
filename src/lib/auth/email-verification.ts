import { SignJWT, jwtVerify } from "jose";

/**
 * Real-account email verification token — same jose SignJWT/jwtVerify-
 * against-AUTH_SECRET shape as src/lib/founding/email-verification.ts,
 * but its own purpose tag and module. Kept separate rather than a
 * shared generic "founding or user" token helper for the same reason
 * Phase 3's onboarding-token module stayed separate from the founding
 * email-verification one: a distinct purpose tag per token type is
 * easier to read and audit than one generic function threaded through
 * several call sites for different accounts.
 */
const PURPOSE = "user_email_verify";
const TTL_SECONDS = 60 * 60 * 48; // 48h

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment — never commit real secrets."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createUserEmailVerificationToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns the userId if the token is valid, unexpired, and carries the right purpose — null otherwise (never throws). */
export async function verifyUserEmailVerificationToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== PURPOSE || typeof payload.userId !== "string") return null;
    return payload.userId;
  } catch {
    return null;
  }
}
