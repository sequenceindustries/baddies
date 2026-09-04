import { SignJWT, jwtVerify } from "jose";

/**
 * Same primitive as src/lib/founding/email-verification.ts (jose
 * SignJWT/jwtVerify against AUTH_SECRET) but its own purpose tag and a
 * much longer TTL — this token is emailed once an admin approves a
 * Founding Baddie, and banking/agreements could reasonably happen days
 * or weeks later, unlike email verification (expected within hours).
 *
 * Deliberately a *separate* module from email-verification.ts rather
 * than a shared "generic founding token" helper with a purpose
 * parameter threaded through every call site — two small, obviously
 * distinct functions are easier to read and audit than one generic one
 * that could be misused for the wrong purpose.
 *
 * This token carries more weight than the email-verification one: it's
 * required (not just the bare application id) to submit banking details
 * — see src/app/api/founding/apply/[id]/banking/route.ts's own comment
 * on why banking gets a stronger guarantee than the identity/document
 * upload endpoint.
 */
const PURPOSE = "founding_onboarding_access";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment — never commit real secrets."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createOnboardingToken(applicationId: string): Promise<string> {
  return new SignJWT({ applicationId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns the applicationId if the token is valid, unexpired, and carries the right purpose — null otherwise (never throws). */
export async function verifyOnboardingToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== PURPOSE || typeof payload.applicationId !== "string") return null;
    return payload.applicationId;
  } catch {
    return null;
  }
}
