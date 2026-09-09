import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";
import { getCurrentRevenueShareRule } from "@/lib/config/revenue-rules";

// Always dynamic: this route reads live, per-user data.
export const dynamic = "force-dynamic";

/**
 * A Founding Partner's own dashboard data — authorized by row ownership
 * (this FoundingPartner.userId === the current user's id) directly, not
 * a role check. A Founding Partner can also apply as a creator (see
 * /api/creator/apply), which flips User.role to CREATOR the same way it
 * does for a FAN applicant — so role alone can no longer tell "is this
 * account a Founding Partner," only the FoundingPartner row's own
 * existence can. Never accepts a partner id from the caller — always
 * resolves "my own" FoundingPartner row server-side, so there is no
 * parameter to tamper with to see another partner's data.
 *
 * Founding Partner Programme v2: every figure here traces to a real
 * stored row — commission earnings come from LedgerEntry/PartnerCommission,
 * never a client-side computation. "Payable"/"paid" are deliberately the
 * partner's own Wallet's cached balances (recomputeWalletBalances,
 * called with the partner-specific PARTNER_COMMISSION_HOLD_DAYS window
 * — see src/lib/ledger/service.ts) rather than re-derived here, so this
 * route is never a second source of truth for those two numbers.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const partner = await db.foundingPartner.findUnique({
    where: { userId: user.id },
    include: {
      user: { select: { wallet: true } },
      referralAttributions: {
        include: {
          foundingApplication: {
            select: { id: true, stageName: true, email: true, status: true, createdAt: true },
          },
        },
        orderBy: { attributedAt: "desc" },
      },
      ledgerEntries: {
        select: {
          id: true,
          type: true,
          grossAmount: true,
          creatorShareAmount: true,
          platformShareAmount: true,
          creatorProfileId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });
  if (!partner) {
    return NextResponse.json({ error: "No Founding Partner record found for this account." }, { status: 404 });
  }

  const acceptance = await db.agreementAcceptance.findFirst({
    where: { userId: user.id },
    include: { agreement: { select: { type: true, title: true, version: true } } },
    orderBy: { acceptedAt: "desc" },
  });

  // --- Per-referred-creator revenue/commission, plus the overview and
  // earnings blocks (spec §5) — everything below is a real aggregate
  // over stored rows, not a projected/estimated figure. ---

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    revenueByCreator,
    commissionByAttribution,
    lifetimeCommissionAgg,
    currentMonthCommissionAgg,
    positionsFilled,
    positionsLimit,
    commissionRule,
    payouts,
  ] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ["creatorProfileId"],
      where: { foundingPartnerId: partner.id, type: "SUBSCRIPTION", creatorProfileId: { not: null } },
      _sum: { grossAmount: true },
    }),
    db.partnerCommission.groupBy({
      by: ["referralAttributionId"],
      where: { foundingPartnerId: partner.id },
      _sum: { commissionAmountUsd: true, reversedAmountUsd: true },
    }),
    db.ledgerEntry.aggregate({
      where: { foundingPartnerId: partner.id, type: { in: ["PARTNER_COMMISSION", "PARTNER_COMMISSION_REVERSAL"] } },
      _sum: { grossAmount: true },
    }),
    db.ledgerEntry.aggregate({
      where: {
        foundingPartnerId: partner.id,
        type: { in: ["PARTNER_COMMISSION", "PARTNER_COMMISSION_REVERSAL"] },
        createdAt: { gte: monthStart },
      },
      _sum: { grossAmount: true },
    }),
    db.foundingPartner.count({ where: { status: "ACTIVE" } }),
    getPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT),
    getCurrentRevenueShareRule("PARTNER_COMMISSION_RATE").catch(() => null),
    db.payout.findMany({
      where: { walletId: partner.user.wallet?.id ?? "__none__" },
      orderBy: { requestedAt: "desc" },
      take: 25,
    }),
  ]);

  // Resolve each referred creator's real CreatorProfile (bridged by
  // email, same pattern resolveCreatorRevenueShare itself uses — a
  // Founding Baddie's application predates their real account, so
  // there's no direct FK) so the per-creator revenue aggregate above
  // (keyed by creatorProfileId) can be matched back to them.
  const applicantEmails = partner.referralAttributions.map((a) => a.foundingApplication.email);
  const creatorProfiles = applicantEmails.length
    ? await db.creatorProfile.findMany({
        where: { user: { email: { in: applicantEmails } } },
        select: { id: true, user: { select: { email: true } } },
      })
    : [];
  const creatorProfileIdByEmail = new Map(creatorProfiles.map((c) => [c.user.email.toLowerCase(), c.id]));
  const revenueByCreatorProfileId = new Map(
    revenueByCreator.map((r) => [r.creatorProfileId as string, Number(r._sum.grossAmount ?? 0)])
  );
  const commissionByAttributionId = new Map(
    commissionByAttribution.map((c) => [
      c.referralAttributionId,
      Number(c._sum.commissionAmountUsd ?? 0) - Number(c._sum.reversedAmountUsd ?? 0),
    ])
  );

  const referredCreators = partner.referralAttributions.map((a) => {
    const creatorProfileId = creatorProfileIdByEmail.get(a.foundingApplication.email.toLowerCase()) ?? null;
    const earningPeriodStatus: "NOT_STARTED" | "ACTIVE" | "EXPIRED" = !a.earningPeriodEndAt
      ? "NOT_STARTED"
      : a.earningPeriodEndAt.getTime() > now.getTime()
        ? "ACTIVE"
        : "EXPIRED";

    return {
      foundingApplicationId: a.foundingApplication.id,
      stageName: a.foundingApplication.stageName,
      status: a.foundingApplication.status,
      appliedAt: a.foundingApplication.createdAt,
      attributedAt: a.attributedAt,
      subscriptionRevenueGeneratedUsd: creatorProfileId ? revenueByCreatorProfileId.get(creatorProfileId) ?? 0 : 0,
      commissionGeneratedUsd: commissionByAttributionId.get(a.id) ?? 0,
      partnerPercentage: commissionRule ? Number(commissionRule.percentage) : null,
      earningPeriodStartAt: a.earningPeriodStartAt,
      earningPeriodEndAt: a.earningPeriodEndAt,
      earningPeriodStatus,
    };
  });

  const remainingActiveEarningPeriods = referredCreators.filter((c) => c.earningPeriodStatus === "ACTIVE").length;
  const totalSubscriptionRevenueGeneratedUsd = referredCreators.reduce(
    (sum, c) => sum + c.subscriptionRevenueGeneratedUsd,
    0
  );

  const appUrl = process.env.APP_URL ?? "https://baddies.africa";

  return NextResponse.json({
    referralCode: partner.referralCode,
    referralLink: `${appUrl}/founding-baddies?ref=${partner.referralCode}`,
    status: partner.status,
    activatedAt: partner.activatedAt,
    joinedPositionNumber: partner.joinedPositionNumber,
    positionsFilled,
    positionsLimit: Number(positionsLimit) || 50,
    referredCreators,
    totalCreatorsReferred: referredCreators.length,
    // "Active" = actually live on the platform (able to generate real
    // subscription revenue) or already has — not merely "not yet
    // rejected," which would count every mid-pipeline application too.
    activeReferredCreators: referredCreators.filter((c) => c.status === "LIVE" || c.subscriptionRevenueGeneratedUsd > 0)
      .length,
    totalSubscriptionRevenueGeneratedUsd,
    remainingActiveEarningPeriods,
    rewardHistory: partner.ledgerEntries.map((l) => ({
      id: l.id,
      type: l.type,
      grossAmount: l.grossAmount,
      creatorShareAmount: l.creatorShareAmount,
      platformShareAmount: l.platformShareAmount,
      creatorProfileId: l.creatorProfileId,
      createdAt: l.createdAt,
    })),
    earnings: {
      lifetimeUsd: Number(lifetimeCommissionAgg._sum.grossAmount ?? 0),
      currentMonthUsd: Number(currentMonthCommissionAgg._sum.grossAmount ?? 0),
      pendingUsd: partner.user.wallet ? Number(partner.user.wallet.cachedPendingBalanceUsd) : 0,
      payableUsd: partner.user.wallet ? Number(partner.user.wallet.cachedAvailableBalanceUsd) : 0,
      paidUsd: partner.user.wallet ? Number(partner.user.wallet.cachedPaidBalanceUsd) : 0,
    },
    payoutHistory: payouts.map((p) => ({
      id: p.id,
      amountUsd: Number(p.amountUsd),
      status: p.status,
      requestedAt: p.requestedAt,
      processedAt: p.processedAt,
    })),
    wallet: partner.user.wallet
      ? {
          pendingBalanceUsd: partner.user.wallet.cachedPendingBalanceUsd,
          availableBalanceUsd: partner.user.wallet.cachedAvailableBalanceUsd,
          paidBalanceUsd: partner.user.wallet.cachedPaidBalanceUsd,
        }
      : null,
    agreement: acceptance
      ? { title: acceptance.agreement.title, version: acceptance.agreement.version, acceptedAt: acceptance.acceptedAt }
      : null,
  });
}
