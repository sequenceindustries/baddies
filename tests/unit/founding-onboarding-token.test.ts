import { describe, it, expect, beforeAll } from "vitest";
import { createOnboardingToken, verifyOnboardingToken } from "@/lib/founding/onboarding-token";
import { SignJWT } from "jose";

describe("founding onboarding token", () => {
  beforeAll(() => {
    if (!process.env.AUTH_SECRET) {
      process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
    }
  });

  it("round-trips: a freshly created token verifies back to its applicationId", async () => {
    const token = await createOnboardingToken("app_abc");
    expect(await verifyOnboardingToken(token)).toBe("app_abc");
  });

  it("rejects a garbage token", async () => {
    expect(await verifyOnboardingToken("not-a-real-token")).toBeNull();
  });

  it("rejects a validly-signed token with the wrong purpose claim", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    // Specifically the email-verification token's purpose — confirms
    // the two token types (short-lived email verify vs. long-lived
    // onboarding access) can't be swapped for each other.
    const wrongPurposeToken = await new SignJWT({ applicationId: "app_def", purpose: "founding_email_verify" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyOnboardingToken(wrongPurposeToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const expiredToken = await new SignJWT({ applicationId: "app_ghi", purpose: "founding_onboarding_access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await verifyOnboardingToken(expiredToken)).toBeNull();
  });
});
