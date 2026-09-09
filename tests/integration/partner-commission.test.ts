import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { postRevenueEvent, postCommissionReversalEvent } from "@/lib/ledger/service";

/**
 * Integration test (real Postgres) for the Founding Partner Programme
 * v2 commission mechanism: the 10% commission postRevenueEvent computes
 * and posts for a referred creator's SUBSCRIPTION revenue, the 12-month
 * earning-period activation/expiry rule, and reversal on refund/
 * chargeback. Same self-skip pattern as the other integration tests in
 * this suite.
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

describe.skipIf(!dbAvailable)("Founding Partner commission (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupApplicationIds: string[] = [];
  const cleanupPartnerUserIds: string[] = [];
  const cleanupInvitationIds: string[] = [];

  afterAll(async () => {
    // PartnerCommission rows FK-reference a LedgerEntry on EITHER side
    // (the creator's SUBSCRIPTION source entry, or the partner's own
    // payout entry) — every commission touching either set of test
    // users must be gone before any LedgerEntry cleanup below runs, or
    // the FK (RESTRICT) rejects the delete.
    await db.partnerCommission.deleteMany({
      where: {
        OR: [
          { sourceLedgerEntry: { wallet: { userId: { in: cleanupUserIds } } } },
          { foundingPartner: { userId: { in: cleanupPartnerUserIds } } },
        ],
      },
    });
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
      await db.ledgerEntry.deleteMany({ where: { wallet: { userId } } });
      await db.foundingPartner.deleteMany({ where: { userId } });
      await db.wallet.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
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
      data: {
        name: "Test Partner",
        code: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email,
        invitedBy: (await db.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
    cleanupInvitationIds.push(invitation.id);
    const user = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "PARTNER", profile: { create: { displayName: "Test Partner" } }, wallet: { create: {} } },
    });
    cleanupPartnerUserIds.push(user.id);
    const partner = await db.foundingPartner.create({
      data: { userId: user.id, invitationId: invitation.id, referralCode: `test-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status: "ACTIVE" },
    });
    const partnerWallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    return { partner, partnerWallet };
  }

  /** Wires up a referred creator + partner + attribution in one call. */
  async function setUpReferredCreator(suffix: string) {
    const email = `referred-${suffix}@example.test`;
    const { partner, partnerWallet } = await createTestPartner(`partner-${suffix}@example.test`);
    const app = await createBareFoundingApplication(email);
    const attribution = await db.referralAttribution.create({
      data: { foundingApplicationId: app.id, foundingPartnerId: partner.id },
    });
    const { creatorProfile, wallet: creatorWallet } = await createRealCreator(email);
    return { partner, partnerWallet, attribution, creatorProfile, creatorWallet };
  }

  it("computes a 10% commission on a SUBSCRIPTION event while the creator still nets the flat 80%", async () => {
    const { partner, partnerWallet, attribution, creatorProfile, creatorWallet } = await setUpReferredCreator(
      `${Date.now()}-a`
    );

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: `sub-${Date.now()}-a`,
    });

    expect(Number(entry.creatorShareAmount)).toBeCloseTo(800, 2);
    expect(Number(entry.platformShareAmount)).toBeCloseTo(200, 2);
    expect(entry.foundingPartnerId).toBe(partner.id);

    const commission = await db.partnerCommission.findUnique({ where: { sourceLedgerEntryId: entry.id } });
    expect(commission).not.toBeNull();
    expect(commission!.foundingPartnerId).toBe(partner.id);
    expect(commission!.referralAttributionId).toBe(attribution.id);
    expect(Number(commission!.netEligibleAmountUsd)).toBeCloseTo(1000, 2);
    expect(Number(commission!.commissionAmountUsd)).toBeCloseTo(100, 2); // 10% of $1000
    expect(commission!.status).toBe("PENDING");

    const updatedAttribution = await db.referralAttribution.findUniqueOrThrow({ where: { id: attribution.id } });
    expect(updatedAttribution.earningPeriodStartAt).not.toBeNull();
    expect(updatedAttribution.earningPeriodEndAt).not.toBeNull();

    const updatedPartnerWallet = await db.wallet.findUniqueOrThrow({ where: { id: partnerWallet.id } });
    // pending + available should sum to the $100 commission credited
    const total =
      Number(updatedPartnerWallet.cachedPendingBalanceUsd) + Number(updatedPartnerWallet.cachedAvailableBalanceUsd);
    expect(total).toBeCloseTo(100, 2);
  });

  it("deducts the payment fee before computing the commission (net eligible revenue, not gross)", async () => {
    const { creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-b`);

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      paymentFeeUsd: 30,
      referenceType: "subscription",
      referenceId: `sub-${Date.now()}-b`,
    });

    const commission = await db.partnerCommission.findUniqueOrThrow({ where: { sourceLedgerEntryId: entry.id } });
    expect(Number(commission.netEligibleAmountUsd)).toBeCloseTo(970, 2); // 1000 - 30 fee
    expect(Number(commission.commissionAmountUsd)).toBeCloseTo(97, 2); // 10% of 970
  });

  it("does not attach a partner commission to non-SUBSCRIPTION revenue, even for a referred creator", async () => {
    const { creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-c`);

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "TIP",
      grossAmountUsd: 500,
      referenceType: "tip",
      referenceId: `tip-${Date.now()}-c`,
    });

    const commission = await db.partnerCommission.findUnique({ where: { sourceLedgerEntryId: entry.id } });
    expect(commission).toBeNull();
  });

  it("posts no commission once the referral's 12-month earning period has expired", async () => {
    const { partner, attribution, creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-d`);

    // Simulate a referral that activated over a year ago.
    await db.referralAttribution.update({
      where: { id: attribution.id },
      data: {
        earningPeriodStartAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        earningPeriodEndAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      },
    });

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: `sub-${Date.now()}-d`,
    });

    // Attribution/reporting is unconditional...
    expect(entry.foundingPartnerId).toBe(partner.id);
    // ...but no commission for revenue earned after the window closed.
    const commission = await db.partnerCommission.findUnique({ where: { sourceLedgerEntryId: entry.id } });
    expect(commission).toBeNull();
  });

  it("a full refund fully reverses the commission and marks it REVERSED", async () => {
    const { partnerWallet, creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-e`);

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: `sub-${Date.now()}-e`,
    });

    const reversal = await postCommissionReversalEvent({
      sourceLedgerEntryId: entry.id,
      amountUsd: 1000, // full refund
      reason: "test: full refund",
    });

    expect(reversal).not.toBeNull();
    expect(Number(reversal!.grossAmount)).toBeCloseTo(-100, 2);

    const commission = await db.partnerCommission.findUniqueOrThrow({ where: { sourceLedgerEntryId: entry.id } });
    expect(commission.status).toBe("REVERSED");
    expect(Number(commission.reversedAmountUsd)).toBeCloseTo(100, 2);

    const updatedPartnerWallet = await db.wallet.findUniqueOrThrow({ where: { id: partnerWallet.id } });
    const total =
      Number(updatedPartnerWallet.cachedPendingBalanceUsd) + Number(updatedPartnerWallet.cachedAvailableBalanceUsd);
    expect(total).toBeCloseTo(0, 2); // +100 commission, -100 reversal
  });

  it("a partial refund proportionally reverses the commission and leaves it PENDING", async () => {
    const { creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-f`);

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: `sub-${Date.now()}-f`,
    });

    // Refund 25% of the original gross amount.
    const reversal = await postCommissionReversalEvent({
      sourceLedgerEntryId: entry.id,
      amountUsd: 250,
      reason: "test: partial refund",
    });

    expect(reversal).not.toBeNull();
    expect(Number(reversal!.grossAmount)).toBeCloseTo(-25, 2); // 25% of the $100 commission

    const commission = await db.partnerCommission.findUniqueOrThrow({ where: { sourceLedgerEntryId: entry.id } });
    expect(commission.status).toBe("PENDING"); // not fully reversed
    expect(Number(commission.reversedAmountUsd)).toBeCloseTo(25, 2);
  });

  it("returns null and does nothing for a source entry that never produced a commission", async () => {
    const { creatorProfile, wallet: creatorWallet } = await createRealCreator(`unreferred-refund-${Date.now()}@example.test`);

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: `sub-${Date.now()}-g`,
    });

    const reversal = await postCommissionReversalEvent({
      sourceLedgerEntryId: entry.id,
      amountUsd: 1000,
      reason: "test: no-op",
    });
    expect(reversal).toBeNull();
  });
});
