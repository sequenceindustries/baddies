import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

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

  // Real, finalized annual profit-pool shares only — never a projection.
  // A year with no row here for this partner genuinely hasn't been
  // finalized yet (or this partner wasn't active when it was).
  const profitShares = await db.partnerProfitShare.findMany({
    where: { foundingPartnerId: partner.id },
    include: { distribution: { select: { year: true, status: true, finalizedAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  const acceptance = await db.agreementAcceptance.findFirst({
    where: { userId: user.id },
    include: { agreement: { select: { type: true, title: true, version: true } } },
    orderBy: { acceptedAt: "desc" },
  });

  const appUrl = process.env.APP_URL ?? "https://baddies.africa";

  return NextResponse.json({
    referralCode: partner.referralCode,
    referralLink: `${appUrl}/founding-baddies?ref=${partner.referralCode}`,
    status: partner.status,
    activatedAt: partner.activatedAt,
    referredCreators: partner.referralAttributions.map((a: (typeof partner.referralAttributions)[number]) => ({
      foundingApplicationId: a.foundingApplication.id,
      stageName: a.foundingApplication.stageName,
      status: a.foundingApplication.status,
      appliedAt: a.foundingApplication.createdAt,
      attributedAt: a.attributedAt,
    })),
    rewardHistory: partner.ledgerEntries.map((l: (typeof partner.ledgerEntries)[number]) => ({
      id: l.id,
      type: l.type,
      grossAmount: l.grossAmount,
      creatorShareAmount: l.creatorShareAmount,
      platformShareAmount: l.platformShareAmount,
      creatorProfileId: l.creatorProfileId,
      createdAt: l.createdAt,
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
    profitShares: profitShares.map((s: (typeof profitShares)[number]) => ({
      year: s.distribution.year,
      amountUsd: s.amountUsd,
      finalizedAt: s.distribution.finalizedAt,
    })),
  });
}
