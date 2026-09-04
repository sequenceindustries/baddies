import { describe, it, expect, beforeAll } from "vitest";
import { createUserEmailVerificationToken, verifyUserEmailVerificationToken } from "@/lib/auth/email-verification";
import { SignJWT } from "jose";

describe("user email verification token", () => {
  beforeAll(() => {
    if (!process.env.AUTH_SECRET) {
      process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
    }
  });

  it("round-trips: a freshly created token verifies back to its userId", async () => {
    const token = await createUserEmailVerificationToken("user_abc");
    expect(await verifyUserEmailVerificationToken(token)).toBe("user_abc");
  });

  it("rejects a garbage token", async () => {
    expect(await verifyUserEmailVerificationToken("not-a-real-token")).toBeNull();
  });

  it("rejects a validly-signed token with the wrong purpose claim", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    // Specifically the Founding Baddies email-verification purpose —
    // confirms the two token types can't be swapped for each other,
    // even though they share the exact same signing shape.
    const wrongPurposeToken = await new SignJWT({ userId: "user_def", purpose: "founding_email_verify" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyUserEmailVerificationToken(wrongPurposeToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const expiredToken = await new SignJWT({ userId: "user_ghi", purpose: "user_email_verify" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await verifyUserEmailVerificationToken(expiredToken)).toBeNull();
  });
});
