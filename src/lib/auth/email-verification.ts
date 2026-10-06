import { SignJWT, jwtVerify } from "jose";

/**
 * Account email-verification token — a stateless jose HS256 JWT signed
 * with AUTH_SECRET, carrying the userId and a dedicated purpose tag so
 * a token minted for any other purpose can never be swapped in. Nothing
 * is stored server-side: the signature + 48h `exp` are the whole proof,
 * and the verify route's `emailVerified: null` guard makes redemption
 * idempotent.
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
