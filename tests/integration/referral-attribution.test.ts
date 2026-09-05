import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { resolveReferralAttribution } from "@/lib/founding/referral-attribution";
import { createReferralAttributionToken } from "@/lib/founding/referral-attribution-token";

/**
 * Integration test (real Postgres) for the referral-attribution
 * resolver — the actual gate that decides whether a submitted
 * FoundingApplication gets attributed to a Founding Partner. Same
 * self-skip pattern as the other integration tests in this suite.
 */
let dbAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
  }
});

afterAll(async () => {
  if (dbAvailable) await db.$disconnect();
});

function requestWithReferralCookie(token: string): NextRequest {
  return new NextRequest("http://localhost/api/founding/apply", {
    headers: { cookie: `baddies_referral=${token}` },
  });
}

describe.skipIf(!dbAvailable)("resolveReferralAttribution (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupInvitationIds: string[] = [];

  afterAll(async () => {
    for (const userId of cleanupUserIds) {
      await db.foundingPartner.deleteMany({ where: { userId } });
      await db.wallet.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    // FoundingPartner rows above are gone by now, so the invitations they
    // referenced (Restrict-on-delete FK) can safely be removed too.
    await db.partnerInvitation.deleteMany({ where: { id: { in: cleanupInvitationIds } } });
  });

  async function createTestPartner(email: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const invitation = await db.partnerInvitation.create({
      data: { email, invitedBy: (await db.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id, status: "ACCEPTED", acceptedAt: new Date() },
    });
    cleanupInvitationIds.push(invitation.id);
    const user = await db.user.create({
      data: {
        email,
        passwordHash: "test-hash",
        role: "PARTNER",
        profile: { create: { displayName: "Test Partner" } },
        wallet: { create: {} },
      },
    });
    cleanupUserIds.push(user.id);
    const partner = await db.foundingPartner.create({
      data: { userId: user.id, invitationId: invitation.id, referralCode: `test-${Date.now()}`, status },
    });
    return partner;
  }

  it("returns null when there is no referral cookie at all", async () => {
    const req = new NextRequest("http://localhost/api/founding/apply");
    expect(await resolveReferralAttribution(req, "someone@example.test")).toBeNull();
  });

  it("returns null for a garbage/tampered cookie value", async () => {
    const req = requestWithReferralCookie("not-a-real-token");
    expect(await resolveReferralAttribution(req, "someone@example.test")).toBeNull();
  });

  it("attributes to the referenced ACTIVE partner for an unrelated applicant", async () => {
    const partner = await createTestPartner(`partner-attr-${Date.now()}@example.test`);
    const token = await createReferralAttributionToken(partner.id);
    const req = requestWithReferralCookie(token);
    expect(await resolveReferralAttribution(req, "applicant@example.test")).toBe(partner.id);
  });

  it("returns null when the referenced partner is SUSPENDED", async () => {
    const partner = await createTestPartner(`partner-suspended-${Date.now()}@example.test`, "SUSPENDED");
    const token = await createReferralAttributionToken(partner.id);
    const req = requestWithReferralCookie(token);
    expect(await resolveReferralAttribution(req, "applicant@example.test")).toBeNull();
  });

  it("returns null for a self-referral (applicant email matches the partner's own account email)", async () => {
    const email = `self-referral-${Date.now()}@example.test`;
    const partner = await createTestPartner(email);
    const token = await createReferralAttributionToken(partner.id);
    const req = requestWithReferralCookie(token);
    // Case-insensitive match, same as the resolver itself
    expect(await resolveReferralAttribution(req, email.toUpperCase())).toBeNull();
  });

  it("returns null when the referenced partner id doesn't exist (e.g. deleted)", async () => {
    const token = await createReferralAttributionToken("nonexistent-partner-id");
    const req = requestWithReferralCookie(token);
    expect(await resolveReferralAttribution(req, "applicant@example.test")).toBeNull();
  });
});
