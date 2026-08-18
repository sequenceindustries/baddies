import crypto from "crypto";

/**
 * Field-level encryption for sensitive data that must never be stored in
 * plaintext — legal names, and anything else added later under the same
 * rule (build brief §26: "Do not expose: Government ID, Legal name unless
 * required").
 *
 * This is a real cryptographic implementation (AES-256-GCM, random IV per
 * value, authenticated), not a placeholder. It replaces the Sprint 0/1
 * stub that intentionally refused to run in production — see git history
 * on src/app/api/creator/apply/route.ts if you need the old guard's
 * reasoning.
 *
 * Key management note: this reads a single symmetric key from
 * FIELD_ENCRYPTION_KEY. That's adequate for Sprint 0-era MVP scale, but
 * before handling real government-ID-linked legal names at production
 * volume, replace this with real KMS-backed envelope encryption (e.g. AWS
 * KMS / GCP KMS data keys) so the raw key never lives in an env var at
 * all. Flagging that explicitly rather than letting this module look more
 * final than it is.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
    const keyB64 = process.env.FIELD_ENCRYPTION_KEY;
    if (!keyB64) {
          throw new Error(
                  "FIELD_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it in the environment — never commit it."
                );
    }
    const key = Buffer.from(keyB64, "base64");
    if (key.length !== 32) {
          throw new Error(
                  `FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256 (got ${key.length}). Generate with \`openssl rand -base64 32\`.`
                );
    }
    return key;
}

/** Encrypts a plaintext string. Output is a single self-contained base64 blob: iv + authTag + ciphertext. */
export function encryptField(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Decrypts a value produced by encryptField(). Throws if the auth tag doesn't verify (tampered or wrong key). */
export function decryptField(encoded: string): string {
    const key = getKey();
    const raw = Buffer.from(encoded, "base64");

  const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
}
