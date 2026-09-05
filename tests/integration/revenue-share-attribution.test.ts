import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { resolveCreatorRevenueShare } from "@/lib/config/revenue-rules";
import { postRevenueEvent } from "@/lib/ledger/service";

/**
 * Integration test (real Postgres) for the bridge between a real creator
 * account and their original Founding Baddie application's referral
 * attribution — the thing that decides whether postRevenueEvent applies
 * the standard or partner-referred revenue share. Same self-skip pattern
 * as the other integration tests in this suite.
 */
let dbAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) await db.$disconnect();
});

describe.skipIf(!dbAvailable)("resolveCreatorRevenueShare + postRevenueEvent (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupApplicationIds: string[] = [];
  const cleanupPartnerUserIds: string[] = [];
  const cleanupInvitationIds: string[] = [];

  afterAll(async () => {
    for (const userId of cleanupUserIds) {
      await db.ledgerEntry.deleteMany({ where: { wallet: { userId } } });
      await db.creatorProfile.deleteMany({ where: { userId } });
      await db.wallet.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    for (const appId of cleanupApplicationIds) {
      await db.referralAttribution.deleteMany({ where: { foundingApplicationId: appId } });
      await db.foundingApplication.deleteMany({ where: { id: appId } });
    }
    for (const userId of cleanupPartnerUserIds) {
      await db.foundingPartner.deleteMany({ where: { userId } });
      await db.wallet.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    // FoundingPartner rows above are gone by now, so the invitations they
    // referenced (Restrict-on-delete FK) can safely be removed too.
    await db.partnerInvitation.deleteMany({ where: { id: { in: cleanupInvitationIds } } });
  });

  async function createRealCreator(email: string) {
    const user = await db.user.create({
      data: {
        email,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Test Creator" } },
        wallet: { create: {} },
      },
    });
    cleanupUserIds.push(user.id);
    const creatorProfile = await db.creatorProfile.create({ data: { userId: user.id, status: "VERIFIED" } });
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    return { user, creatorProfile, wallet };
  }

  async function createBareFoundingApplication(email: string) {
    const app = await db.foundingApplication.create({
      data: {
        fullName: "Test Applicant",
        stageName: "TestStage",
        email,
        phone: "0820000000",
        country: "South Africa",
        city: "Cape Town",
        platforms: [],
        whyJoinBaddies: "",
        confirmsAdult: true,
        agreesToVerification: true,
      },
    });
    cleanupApplicationIds.push(app.id);
    return app;
  }

  async function createTestPartner(email: string) {
    const invitation = await db.partnerInvitation.create({
      data: { email, invitedBy: (await db.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id, status: "ACCEPTED", acceptedAt: new Date() },
    });
    cleanupInvitationIds.push(invitation.id);
    const user = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "PARTNER", profile: { create: { displayName: "Test Partner" } }, wallet: { create: {} } },
    });
    cleanupPartnerUserIds.push(user.id);
    return db.foundingPartner.create({
      data: { userId: user.id, invitationId: invitation.id, referralCode: `test-rev-${Date.now()}`, status: "ACTIVE" },
    });
  }

  it("resolves STANDARD_CREATOR_SHARE for a creator with no matching Founding application at all", async () => {
    const { creatorProfile } = await createRealCreator(`no-app-${Date.now()}@example.test`);
    const { rule, foundingPartnerId } = await resolveCreatorRevenueShare(creatorProfile.id);
    expect(rule.type).toBe("STANDARD_CREATOR_SHARE");
    expect(foundingPartnerId).toBeNull();
  });

  it("resolves STANDARD_CREATOR_SHARE for a creator whose Founding application has no referral attribution", async () => {
    const email = `unreferred-${Date.now()}@example.test`;
    await createBareFoundingApplication(email);
    const { creatorProfile } = await createRealCreator(email);
    const { rule, foundingPartnerId } = await resolveCreatorRevenueShare(creatorProfile.id);
    expect(rule.type).toBe("STANDARD_CREATOR_SHARE");
    expect(foundingPartnerId).toBeNull();
  });

  it("resolves PARTNER_REFERRED_CREATOR_SHARE and the correct partner id when the Founding application IS attributed", async () => {
    const email = `referred-${Date.now()}@example.test`;
    const partner = await createTestPartner(`partner-rev-${Date.now()}@example.test`);
    const app = await createBareFoundingApplication(email);
    await db.referralAttribution.create({ data: { foundingApplicationId: app.id, foundingPartnerId: partner.id } });
    const { creatorProfile } = await createRealCreator(email);

    const { rule, foundingPartnerId } = await resolveCreatorRevenueShare(creatorProfile.id);
    expect(rule.type).toBe("PARTNER_REFERRED_CREATOR_SHARE");
    expect(foundingPartnerId).toBe(partner.id);
  });

  it("postRevenueEvent stamps the resolved rule + partner onto the LedgerEntry and applies the higher split", async () => {
    const email = `ledger-referred-${Date.now()}@example.test`;
    const partner = await createTestPartner(`partner-ledger-${Date.now()}@example.test`);
    const app = await createBareFoundingApplication(email);
    await db.referralAttribution.create({ data: { foundingApplicationId: app.id, foundingPartnerId: partner.id } });
    const { creatorProfile, wallet } = await createRealCreator(email);

    const entry = await postRevenueEvent({
      walletId: wallet.id,
      creatorProfileId: creatorProfile.id,
      type: "TIP",
      grossAmountUsd: 100,
      referenceType: "test",
      referenceId: "test-ref",
    });

    expect(entry.foundingPartnerId).toBe(partner.id);
    expect(entry.revenueShareRuleId).not.toBeNull();
    expect(Number(entry.creatorShareAmount)).toBeCloseTo(85, 2); // 85% partner-referred rate
    expect(Number(entry.platformShareAmount)).toBeCloseTo(15, 2);
  });

  it("postRevenueEvent applies the standard 80% split and leaves foundingPartnerId null for a non-referred creator", async () => {
    const { creatorProfile, wallet } = await createRealCreator(`ledger-standard-${Date.now()}@example.test`);

    const entry = await postRevenueEvent({
      walletId: wallet.id,
      creatorProfileId: creatorProfile.id,
      type: "TIP",
      grossAmountUsd: 100,
      referenceType: "test",
      referenceId: "test-ref-2",
    });

    expect(entry.foundingPartnerId).toBeNull();
    expect(Number(entry.creatorShareAmount)).toBeCloseTo(80, 2);
    expect(Number(entry.platformShareAmount)).toBeCloseTo(20, 2);
  });
});
