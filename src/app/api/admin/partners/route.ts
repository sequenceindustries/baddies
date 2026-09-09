import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Full Founding Partner roster with embedded referral + ledger detail —
 * one GET, not paginated: the programme is capped at 50 partners total
 * (see FOUNDING_PARTNERS_LIMIT), so there's no dataset-size reason to
 * split this into a list route plus a per-partner detail route the way
 * CreatorQueue/FoundingApplicationsQueue need to for their much larger
 * tables.
 *
 * Founding Partner Programme v2: each partner's commissionSummary comes
 * straight from their own Wallet's cached balances (never re-derived
 * here) plus a real aggregate over PartnerCommission — same "one
 * source of truth" discipline as GET /api/partner/dashboard.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "founding_partner:manage");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const [partners, positionsLimit] = await Promise.all([
    db.foundingPartner.findMany({
      orderBy: { activatedAt: "asc" },
      include: {
        user: { select: { email: true, wallet: true } },
        referralAttributions: {
          include: {
            foundingApplication: { select: { id: true, stageName: true, email: true, status: true } },
          },
        },
        ledgerEntries: {
          select: { id: true, type: true, grossAmount: true, creatorShareAmount: true, platformShareAmount: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT),
  ]);

  // One extra query rather than a nested Prisma include — AgreementAcceptance
  // has no direct relation declared on FoundingPartner (it's keyed by
  // User.id, the same "userId" slot every real account's agreement
  // acceptance uses), so it's looked up by userId here instead.
  const userIds = partners.map((p: (typeof partners)[number]) => p.userId);
  const [acceptances, commissionAggByPartner] = await Promise.all([
    userIds.length
      ? db.agreementAcceptance.findMany({
          where: { userId: { in: userIds }, agreement: { type: "PARTNER_AGREEMENT" } },
          include: { agreement: { select: { version: true } } },
          orderBy: { acceptedAt: "desc" },
        })
      : Promise.resolve([]),
    partners.length
      ? db.partnerCommission.groupBy({
          by: ["foundingPartnerId", "status"],
          where: { foundingPartnerId: { in: partners.map((p: (typeof partners)[number]) => p.id) } },
          _sum: { commissionAmountUsd: true, reversedAmountUsd: true },
        })
      : Promise.resolve([]),
  ]);
  const acceptanceByUserId = new Map(acceptances.map((a: (typeof acceptances)[number]) => [a.userId, a]));

  const now = new Date();

  return NextResponse.json({
    positionsFilled: partners.filter((p: (typeof partners)[number]) => p.status === "ACTIVE").length,
    positionsLimit: Number(positionsLimit) || 50,
    partners: partners.map((p: (typeof partners)[number]) => {
      const acceptance = acceptanceByUserId.get(p.userId);
      const lifetimeUsd = commissionAggByPartner
        .filter((c: (typeof commissionAggByPartner)[number]) => c.foundingPartnerId === p.id)
        .reduce(
          (sum: number, c: (typeof commissionAggByPartner)[number]) =>
            sum + Number(c._sum.commissionAmountUsd ?? 0) - Number(c._sum.reversedAmountUsd ?? 0),
          0
        );
      const activeEarningPeriods = p.referralAttributions.filter(
        (a: (typeof p.referralAttributions)[number]) => a.earningPeriodEndAt && a.earningPeriodEndAt.getTime() > now.getTime()
      ).length;
      const expiredEarningPeriods = p.referralAttributions.filter(
        (a: (typeof p.referralAttributions)[number]) => a.earningPeriodEndAt && a.earningPeriodEndAt.getTime() <= now.getTime()
      ).length;

      return {
        id: p.id,
        email: p.user.email,
        referralCode: p.referralCode,
        status: p.status,
        activatedAt: p.activatedAt,
        joinedPositionNumber: p.joinedPositionNumber,
        referredCreators: p.referralAttributions.map((a: (typeof p.referralAttributions)[number]) => ({
          foundingApplicationId: a.foundingApplication.id,
          stageName: a.foundingApplication.stageName,
          email: a.foundingApplication.email,
          status: a.foundingApplication.status,
          correctedBy: a.correctedBy,
          correctionReason: a.correctionReason,
        })),
        ledgerEntryCount: p.ledgerEntries.length,
        ledgerEntries: p.ledgerEntries.slice(0, 20),
        agreement: acceptance
          ? { version: acceptance.agreement.version, acceptedAt: acceptance.acceptedAt }
          : null,
        commissionSummary: {
          lifetimeUsd,
          pendingUsd: p.user.wallet ? Number(p.user.wallet.cachedPendingBalanceUsd) : 0,
          payableUsd: p.user.wallet ? Number(p.user.wallet.cachedAvailableBalanceUsd) : 0,
          paidUsd: p.user.wallet ? Number(p.user.wallet.cachedPaidBalanceUsd) : 0,
        },
        earningPeriods: { active: activeEarningPeriods, expired: expiredEarningPeriods },
      };
    }),
  });
}
