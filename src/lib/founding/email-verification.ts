import { SignJWT, jwtVerify } from "jose";

/**
 * Stateless email-verification link token — same primitive
 * src/lib/auth/session.ts already uses for session cookies (jose
 * SignJWT/jwtVerify against AUTH_SECRET), reused here instead of a new
 * DB-stored token-hash column. A DB hash lookup (like Session.tokenHash)
 * only works when you already know which row to compare against; a
 * mailed link has no such row to start from, so a self-contained signed
 * token is the right primitive, not a variant of the existing one.
 *
 * `purpose` is embedded and checked on verify so this token can never be
 * replayed as a different kind of token even if the signing key is ever
 * shared across token types in the future.
 */
const PURPOSE = "founding_email_verify";
const TTL_SECONDS = 60 * 60 * 48; // 48h — long enough to survive someone checking email the next day

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment — never commit real secrets."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createEmailVerificationToken(applicationId: string): Promise<string> {
  return new SignJWT({ applicationId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns the applicationId if the token is valid, unexpired, and carries the right purpose — null otherwise (never throws). */
export async function verifyEmailVerificationToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== PURPOSE || typeof payload.applicationId !== "string") return null;
    return payload.applicationId;
  } catch {
    return null;
  }
}
