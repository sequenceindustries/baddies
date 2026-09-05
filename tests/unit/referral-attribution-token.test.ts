import { describe, it, expect, beforeAll } from "vitest";
import {
  createReferralAttributionToken,
  verifyReferralAttributionToken,
} from "@/lib/founding/referral-attribution-token";
import { SignJWT } from "jose";

describe("referral attribution token", () => {
  beforeAll(() => {
    if (!process.env.AUTH_SECRET) {
      process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
    }
  });

  it("round-trips: a freshly created token verifies back to its foundingPartnerId", async () => {
    const token = await createReferralAttributionToken("partner_abc");
    expect(await verifyReferralAttributionToken(token)).toBe("partner_abc");
  });

  it("rejects a garbage token", async () => {
    expect(await verifyReferralAttributionToken("not-a-real-token")).toBeNull();
  });

  it("rejects a validly-signed token with the wrong purpose claim", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const wrongPurposeToken = await new SignJWT({ foundingPartnerId: "partner_def", purpose: "partner_invite" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyReferralAttributionToken(wrongPurposeToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const expiredToken = await new SignJWT({ foundingPartnerId: "partner_ghi", purpose: "referral_attribution" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await verifyReferralAttributionToken(expiredToken)).toBeNull();
  });
});
