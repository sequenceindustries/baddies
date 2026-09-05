import { describe, it, expect, beforeAll } from "vitest";
import { createPartnerInviteToken, verifyPartnerInviteToken } from "@/lib/founding/partner-invite-token";
import { SignJWT } from "jose";

describe("partner invite token", () => {
  beforeAll(() => {
    if (!process.env.AUTH_SECRET) {
      process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
    }
  });

  it("round-trips: a freshly created token (default TTL) verifies back to its invitationId", async () => {
    const token = await createPartnerInviteToken("inv_abc");
    expect(await verifyPartnerInviteToken(token)).toBe("inv_abc");
  });

  it("round-trips with an explicit, per-invitation TTL", async () => {
    const token = await createPartnerInviteToken("inv_custom", 60 * 60 * 24 * 3); // 3 days
    expect(await verifyPartnerInviteToken(token)).toBe("inv_custom");
  });

  it("rejects a garbage token", async () => {
    expect(await verifyPartnerInviteToken("not-a-real-token")).toBeNull();
  });

  it("rejects a validly-signed token with the wrong purpose claim", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const wrongPurposeToken = await new SignJWT({ invitationId: "inv_def", purpose: "founding_onboarding_access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyPartnerInviteToken(wrongPurposeToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const expiredToken = await new SignJWT({ invitationId: "inv_ghi", purpose: "partner_invite" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await verifyPartnerInviteToken(expiredToken)).toBeNull();
  });
});
