import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import {
  postRevenueEvent,
  postCommissionReversalEvent,
  postPayoutEvent,
  recomputeWalletBalances,
} from "@/lib/ledger/service";
import { createReferralAttributionToken } from "@/lib/founding/referral-attribution-token";
import { setPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";
import { POST as applyFounding } from "@/app/api/founding/apply/route";

/**
 * Phase 6 — end-to-end hardening. A handful of scenarios the spec
 * explicitly calls out that no earlier phase's tests directly cover:
 * first-attribution-is-immutable (never "last click wins" or
 * reassignable via a second application attempt), and a chargeback
 * arriving after a payout has already gone out (must go negative,
 * never claws back money already paid — spec §10). The full lifecycle
 * itself (invite -> accept -> referral -> apply -> commission ->
 * payout) and the 50-cap concurrency race are covered by the real
 * routes/functions exercised across this suite's other integration
 * test files (partner-cap.test.ts, partner-commission.test.ts,
 * payment-webhook-commission.test.ts) — this file adds the two gaps,
 * not a duplicate walk of everything already proven elsewhere.
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

function jsonRequest(url: string, body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)("Founding Partner Programme v2 — Phase 6 hardening (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupApplicationIds: string[] = [];
  const cleanupPartnerUserIds: string[] = [];
  const cleanupInvitationIds: string[] = [];

  afterAll(async () => {
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
      await db.session.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    for (const appId of cleanupApplicationIds) {
      await db.referralAttribution.deleteMany({ where: { foundingApplicationId: appId } });
      await db.foundingApplication.deleteMany({ where: { id: appId } });
    }
    for (const userId of cleanupPartnerUserIds) {
      await db.payout.deleteMany({ where: { wallet: { userId } } });
      await db.ledgerEntry.deleteMany({ where: { wallet: { userId } } });
      await db.foundingPartner.deleteMany({ where: { userId } });
      await db.wallet.deleteMany({ where: { userId } });
      await db.session.deleteMany({ where: { userId } });
      await db.agreementAcceptance.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.partnerInvitation.deleteMany({ where: { id: { in: cleanupInvitationIds } } });
  });

  async function createTestPartner(suffix: string) {
    const email = `lifecycle-partner-${suffix}@example.test`;
    const invitation = await db.partnerInvitation.create({
      data: {
        name: "Lifecycle Partner",
        code: `lc-${Date.now()}-${suffix}`,
        invitedBy: (await db.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
    cleanupInvitationIds.push(invitation.id);
    const user = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "PARTNER", profile: { create: { displayName: "Lifecycle Partner" } }, wallet: { create: {} } },
    });
    cleanupPartnerUserIds.push(user.id);
    const partner = await db.foundingPartner.create({
      data: { userId: user.id, invitationId: invitation.id, referralCode: `lc-${suffix}-${Date.now()}`, status: "ACTIVE" },
    });
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    return { partner, wallet };
  }

  it("first attribution is immutable: a blocked re-application attempt through a DIFFERENT referral link never changes the original attribution", async () => {
    const { partner: partnerA } = await createTestPartner(`${Date.now()}-a1`);
    const { partner: partnerB } = await createTestPartner(`${Date.now()}-b1`);

    const email = `lifecycle-applicant-${Date.now()}@example.test`;
    const tokenA = await createReferralAttributionToken(partnerA.id);

    const applyReqA = jsonRequest(
      "http://localhost/api/founding/apply",
      {
        fullName: "Lifecycle Applicant",
        stageName: "LifecycleStage",
        email,
        password: "a-real-password-123",
        phone: "0820000000",
        country: "South Africa",
        city: "Cape Town",
        platforms: [{ category: "social", platform: "Instagram", handle: "@lifecycle", link: "" }],
        confirmsAdult: true,
        agreesToVerification: true,
      },
      { cookie: `baddies_referral=${tokenA}`, "x-forwarded-for": `10.0.1.${Date.now() % 250}` }
    );
    const resA = await applyFounding(applyReqA);
    expect(resA.status).toBe(201);

    const application = await db.foundingApplication.findFirstOrThrow({ where: { email } });
    cleanupApplicationIds.push(application.id);
    const createdUser = await db.user.findFirstOrThrow({ where: { email } });
    cleanupUserIds.push(createdUser.id);

    const attributionBefore = await db.referralAttribution.findUniqueOrThrow({
      where: { foundingApplicationId: application.id },
    });
    expect(attributionBefore.foundingPartnerId).toBe(partnerA.id);

    // A second attempt through partner B's link, same email — the
    // existing-account check blocks it outright (409), exactly as it
    // does for any duplicate-email attempt; the point here is that
    // this can NEVER silently reassign the attribution "last click
    // wins" style, because it never even reaches that code path.
    const tokenB = await createReferralAttributionToken(partnerB.id);
    const applyReqB = jsonRequest(
      "http://localhost/api/founding/apply",
      {
        fullName: "Lifecycle Applicant",
        stageName: "LifecycleStage",
        email,
        password: "a-different-password-456",
        phone: "0820000001",
        country: "South Africa",
        city: "Cape Town",
        platforms: [{ category: "social", platform: "Instagram", handle: "@lifecycle2", link: "" }],
        confirmsAdult: true,
        agreesToVerification: true,
      },
      { cookie: `baddies_referral=${tokenB}`, "x-forwarded-for": `10.0.2.${Date.now() % 250}` }
    );
    const resB = await applyFounding(applyReqB);
    expect(resB.status).toBe(409);

    const attributionAfter = await db.referralAttribution.findUniqueOrThrow({
      where: { foundingApplicationId: application.id },
    });
    expect(attributionAfter.foundingPartnerId).toBe(partnerA.id); // unchanged
    expect(attributionAfter.correctedBy).toBeNull(); // never touched
    // Still exactly one application for this email, and exactly one
    // attribution — no duplicate/second row was ever created.
    const applicationCount = await db.foundingApplication.count({ where: { email } });
    expect(applicationCount).toBe(1);
    const attributionCount = await db.referralAttribution.count({ where: { foundingApplicationId: application.id } });
    expect(attributionCount).toBe(1);
  });

  it("a chargeback arriving after the partner's commission was already paid out goes negative — it never claws back the paid amount", async () => {
    const { partner, wallet } = await createTestPartner(`${Date.now()}-c1`);

    const app = await db.foundingApplication.create({
      data: {
        fullName: "Payout Applicant",
        stageName: "PayoutStage",
        email: `lifecycle-payout-creator-${Date.now()}@example.test`,
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
      data: { email: app.email, passwordHash: "test-hash", role: "CREATOR", profile: { create: { displayName: "Payout Creator" } }, wallet: { create: {} } },
    });
    cleanupUserIds.push(creatorUser.id);
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });
    const creatorWallet = await db.wallet.findUniqueOrThrow({ where: { userId: creatorUser.id } });

    // Make the commission's hold window instant so it's immediately
    // available, then simulate the partner already having been paid.
    const originalHoldDays = await db.platformSetting.findUnique({ where: { key: BUSINESS_CONFIG_KEYS.PARTNER_COMMISSION_HOLD_DAYS } });
    await setPlatformSetting(BUSINESS_CONFIG_KEYS.PARTNER_COMMISSION_HOLD_DAYS, "0");

    const entry = await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: creatorProfile.id,
      type: "SUBSCRIPTION",
      grossAmountUsd: 1000,
      referenceType: "subscription",
      referenceId: `lifecycle-sub-${Date.now()}`,
    });

    const walletAfterCommission = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect(Number(walletAfterCommission.cachedAvailableBalanceUsd)).toBeCloseTo(100, 2);

    // Real payout: post the PAYOUT ledger entry, same as the admin
    // approval route does (see POST /api/admin/payouts/[payoutId]/approve).
    const payout = await db.payout.create({ data: { walletId: wallet.id, amountUsd: 100, status: "PAID" } });
    await postPayoutEvent({ walletId: wallet.id, payoutId: payout.id, amountUsd: 100 });
    await recomputeWalletBalances(wallet.id, 0);

    const walletAfterPayout = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect(Number(walletAfterPayout.cachedAvailableBalanceUsd)).toBeCloseTo(0, 2);
    expect(Number(walletAfterPayout.cachedPaidBalanceUsd)).toBeCloseTo(100, 2);

    // Now the chargeback arrives — after the money is already out the
    // door.
    const reversal = await postCommissionReversalEvent({
      sourceLedgerEntryId: entry.id,
      amountUsd: 1000,
      reason: "test: chargeback after payout",
    });
    expect(reversal).not.toBeNull();

    const walletAfterChargeback = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    // Available balance goes negative — the platform now carries the
    // liability, exactly as spec §10 requires ("never confiscate
    // legitimate earnings" — meaning the ALREADY-PAID money specifically).
    expect(Number(walletAfterChargeback.cachedAvailableBalanceUsd)).toBeCloseTo(-100, 2);
    // The paid figure is untouched — nothing ever claws back a
    // completed payout.
    expect(Number(walletAfterChargeback.cachedPaidBalanceUsd)).toBeCloseTo(100, 2);

    const commission = await db.partnerCommission.findUniqueOrThrow({ where: { sourceLedgerEntryId: entry.id } });
    expect(commission.status).toBe("REVERSED");

    await setPlatformSetting(BUSINESS_CONFIG_KEYS.PARTNER_COMMISSION_HOLD_DAYS, originalHoldDays?.value ?? "30");
  });
});
