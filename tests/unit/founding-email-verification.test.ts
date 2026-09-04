import { describe, it, expect, beforeAll } from "vitest";
import { createEmailVerificationToken, verifyEmailVerificationToken } from "@/lib/founding/email-verification";
import { SignJWT } from "jose";

describe("founding email verification token", () => {
  beforeAll(() => {
    // tests/setup (via vitest config) already sets a real AUTH_SECRET for
    // the app's own auth session tests — reuse whatever is already there
    // rather than assuming a specific value.
    if (!process.env.AUTH_SECRET) {
      process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
    }
  });

  it("round-trips: a freshly created token verifies back to its applicationId", async () => {
    const token = await createEmailVerificationToken("app_123");
    const result = await verifyEmailVerificationToken(token);
    expect(result).toBe("app_123");
  });

  it("rejects a garbage token", async () => {
    expect(await verifyEmailVerificationToken("not-a-real-token")).toBeNull();
  });

  it("rejects a validly-signed token with the wrong purpose claim", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const wrongPurposeToken = await new SignJWT({ applicationId: "app_456", purpose: "something_else" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyEmailVerificationToken(wrongPurposeToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const expiredToken = await new SignJWT({ applicationId: "app_789", purpose: "founding_email_verify" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await verifyEmailVerificationToken(expiredToken)).toBeNull();
  });
});
