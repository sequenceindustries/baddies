import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { postRevenueEvent } from "@/lib/ledger/service";
import { POST as paymentWebhook } from "@/app/api/webhooks/payment/route";

/**
 * Integration test (real Postgres) for the payment webhook's
 * refund/chargeback -> Founding Partner commission reversal
 * correlation (originalReferenceType/originalReferenceId -> the source
 * SUBSCRIPTION LedgerEntry -> its PartnerCommission), and the
 * MANUAL_REVIEW AbuseFlag written when that correlation can't be made.
 * Calls the route's exported POST handler directly (getPaymentProvider
 * defaults to the stub provider whether or not PAYMENT_PROVIDER is set,
 * so no env setup is needed) rather than a real HTTP round trip — same
 * self-skip pattern as the rest of this suite.
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

function webhookRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/payment", {
    method: "POST",
    headers: { "x-payment-signature": "test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)("payment webhook -> partner commission reversal (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupApplicationIds: string[] = [];
  const cleanupPartnerUserIds: string[] = [];
  const cleanupInvitationIds: string[] = [];
  const cleanupAbuseFlagIds: string[] = [];

  afterAll(async () => {
    await db.partnerCommission.deleteMany({
      where: {
        OR: [
          { sourceLedgerEntry: { wallet: { userId: { in: cleanupUserIds } } } },
          { foundingPartner: { userId: { in: cleanupPartnerUserIds } } },
        ],
      },
    });
    await db.abuseFlag.deleteMany({ where: { id: { in: cleanupAbuseFlagIds } } });
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

  async function setUpReferredCreator(suffix: string) {
    const email = `wh-referred-${suffix}@example.test`;
    const partnerEmail = `wh-partner-${suffix}@example.test`;

    const invitation = await db.partnerInvitation.create({
      data: {
        name: "Test Partner",
        code: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email: partnerEmail,
        invitedBy: (await db.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
    cleanupInvitationIds.push(invitation.id);
    const partnerUser = await db.user.create({
      data: { email: partnerEmail, passwordHash: "test-hash", role: "PARTNER", profile: { create: { displayName: "WH Partner" } }, wallet: { create: {} } },
    });
    cleanupPartnerUserIds.push(partnerUser.id);
    const partner = await db.foundingPartner.create({
      data: { userId: partnerUser.id, invitationId: invitation.id, referralCode: `wh-${Date.now()}-${suffix}`, status: "ACTIVE" },
    });

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
    await db.referralAttribution.create({ data: { foundingApplicationId: app.id, foundingPartnerId: partner.id } });

    const creatorUser = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "CREATOR", profile: { create: { displayName: "Test Creator" } }, wallet: { create: {} } },
    });
    cleanupUserIds.push(creatorUser.id);
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });
    const creatorWallet = await db.wallet.findUniqueOrThrow({ where: { userId: creatorUser.id } });

    return { partner, app, creatorProfile, creatorWallet };
  }

  it("a refund whose payload correlates to the source SUBSCRIPTION entry reverses the partner's commission", async () => {
    const { creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-a`);
    const subscriptionId = `wh-sub-${Date.now()}-a`;

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: subscriptionId,
    });

    const commissionBefore = await db.partnerCommission.findUniqueOrThrow({ where: { sourceLedgerEntryId: entry.id } });
    expect(commissionBefore.status).toBe("PENDING");

    const res = await paymentWebhook(
      webhookRequest({
        type: "refund.completed",
        data: {
          walletId: creatorWallet.id,
          amountUsd: 1000,
          referenceId: `refund-${Date.now()}-a`,
          originalReferenceType: "subscription",
          originalReferenceId: subscriptionId,
        },
      })
    );
    expect(res.status).toBe(200);

    const commissionAfter = await db.partnerCommission.findUniqueOrThrow({ where: { sourceLedgerEntryId: entry.id } });
    expect(commissionAfter.status).toBe("REVERSED");
    expect(Number(commissionAfter.reversedAmountUsd)).toBeCloseTo(100, 2);
  });

  it("a chargeback whose payload can't be correlated to any source entry writes a MANUAL_REVIEW flag instead of silently dropping it", async () => {
    const { creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-b`);
    // No matching SUBSCRIPTION entry exists for this referenceId at all.
    const bogusOriginalId = `wh-nonexistent-${Date.now()}-b`;

    const flagsBefore = await db.abuseFlag.count({ where: { type: "MANUAL_REVIEW" } });

    const res = await paymentWebhook(
      webhookRequest({
        type: "chargeback.opened",
        data: {
          walletId: creatorWallet.id,
          amountUsd: 500,
          referenceId: `chargeback-${Date.now()}-b`,
          originalReferenceType: "subscription",
          originalReferenceId: bogusOriginalId,
        },
      })
    );
    expect(res.status).toBe(200);

    const flagsAfter = await db.abuseFlag.findMany({
      where: { type: "MANUAL_REVIEW", reason: { contains: bogusOriginalId } },
    });
    expect(flagsAfter.length).toBe(1);
    cleanupAbuseFlagIds.push(...flagsAfter.map((f) => f.id));

    const totalAfter = await db.abuseFlag.count({ where: { type: "MANUAL_REVIEW" } });
    expect(totalAfter).toBe(flagsBefore + 1);

    // Suppress unused-variable lint on creatorProfile — kept for setup symmetry/readability.
    void creatorProfile;
  });

  it("a refund for a non-referred creator's subscription is a no-op for commissions (nothing to reverse, no flag)", async () => {
    const email = `wh-unreferred-${Date.now()}@example.test`;
    const user = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "CREATOR", profile: { create: { displayName: "Unreferred" } }, wallet: { create: {} } },
    });
    cleanupUserIds.push(user.id);
    const creatorProfile = await db.creatorProfile.create({ data: { userId: user.id, status: "VERIFIED" } });
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    const subscriptionId = `wh-sub-${Date.now()}-c`;

    await postRevenueEvent({
      walletId: wallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: subscriptionId,
    });

    const flagsBefore = await db.abuseFlag.count({ where: { type: "MANUAL_REVIEW" } });

    const res = await paymentWebhook(
      webhookRequest({
        type: "refund.completed",
        data: {
          walletId: wallet.id,
          amountUsd: 1000,
          referenceId: `refund-${Date.now()}-c`,
          originalReferenceType: "subscription",
          originalReferenceId: subscriptionId,
        },
      })
    );
    expect(res.status).toBe(200);

    // The source entry DOES resolve (it's a real SUBSCRIPTION entry) but
    // has no PartnerCommission — postCommissionReversalEvent's own
    // no-op path, not the unresolved-correlation flag path.
    const flagsAfter = await db.abuseFlag.count({ where: { type: "MANUAL_REVIEW" } });
    expect(flagsAfter).toBe(flagsBefore);
  });

  it("a chargeback that reverses a partner-attributed commission writes exactly one SUSPICIOUS_CHARGEBACK_PATTERN flag", async () => {
    const { partner, creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-d`);
    const subscriptionId = `wh-sub-${Date.now()}-d`;

    await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: subscriptionId,
    });

    const res = await paymentWebhook(
      webhookRequest({
        type: "chargeback.opened",
        data: {
          walletId: creatorWallet.id,
          amountUsd: 1000,
          referenceId: `chargeback-${Date.now()}-d`,
          originalReferenceType: "subscription",
          originalReferenceId: subscriptionId,
        },
      })
    );
    expect(res.status).toBe(200);

    const flags = await db.abuseFlag.findMany({
      where: { type: "SUSPICIOUS_CHARGEBACK_PATTERN", foundingPartnerId: partner.id },
    });
    expect(flags.length).toBe(1);
    expect(flags[0]!.autoDetected).toBe(true);
    cleanupAbuseFlagIds.push(...flags.map((f) => f.id));
  });

  it("the 3rd refund-reversed commission for the same referral within 30 days writes a SUSPICIOUS_REFUND_PATTERN flag (the first two don't)", async () => {
    const { partner, creatorProfile, creatorWallet } = await setUpReferredCreator(`${Date.now()}-e`);

    async function refundOneSubscription(suffix: string) {
      const subscriptionId = `wh-sub-${Date.now()}-e-${suffix}`;
      await postRevenueEvent({
        walletId: creatorWallet.id,
        creatorProfileId: creatorProfile.id,
        type: "SUBSCRIPTION",
        grossAmountUsd: 1000,
        referenceType: "subscription",
        referenceId: subscriptionId,
      });
      const res = await paymentWebhook(
        webhookRequest({
          type: "refund.completed",
          data: {
            walletId: creatorWallet.id,
            amountUsd: 1000,
            referenceId: `refund-${Date.now()}-e-${suffix}`,
            originalReferenceType: "subscription",
            originalReferenceId: subscriptionId,
          },
        })
      );
      expect(res.status).toBe(200);
    }

    await refundOneSubscription("1");
    let flags = await db.abuseFlag.findMany({ where: { type: "SUSPICIOUS_REFUND_PATTERN", foundingPartnerId: partner.id } });
    expect(flags.length).toBe(0);

    await refundOneSubscription("2");
    flags = await db.abuseFlag.findMany({ where: { type: "SUSPICIOUS_REFUND_PATTERN", foundingPartnerId: partner.id } });
    expect(flags.length).toBe(0);

    await refundOneSubscription("3");
    flags = await db.abuseFlag.findMany({ where: { type: "SUSPICIOUS_REFUND_PATTERN", foundingPartnerId: partner.id } });
    expect(flags.length).toBe(1);
    expect(flags[0]!.autoDetected).toBe(true);
    cleanupAbuseFlagIds.push(...flags.map((f) => f.id));
  });
});
