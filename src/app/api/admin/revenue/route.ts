import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { pctChange, ratePercent, rangeBounds, RANGES, type Range } from "@/lib/analytics/rates";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The Revenue tab's one data source. Every figure comes straight from
 * LedgerEntry/Subscription/UnlimitedSubscription/Payout — see this
 * session's plan file for which definitions are exact (MRR, creator/
 * platform share, churn) vs. deliberately omitted (no MRR-over-time
 * chart — there's no historical snapshot table to back one).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "ledger:view_any");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: Range = RANGES.includes(rangeParam as Range) ? (rangeParam as Range) : "7d";
  const now = new Date();
  const { since, prevSince, prevUntil } = rangeBounds(range, now);
  const inRange = since ? { createdAt: { gte: since } } : {};
  const inPrevRange = prevSince && prevUntil ? { createdAt: { gte: prevSince, lt: prevUntil } } : null;

  const cancelledInRangeWhere = since ? { cancelledAt: { gte: since } } : { cancelledAt: { not: null } };
  const activeAtStartWhere = since ? { startedAt: { lt: since }, OR: [{ cancelledAt: null }, { cancelledAt: { gte: since } }] } : null;

  const [
    grossAllTime,
    grossInRange,
    grossPrevRange,
    shareAllTime,
    activeSubs,
    activeUnlimited,
    activeSubsSum,
    activeUnlimitedSum,
    newSubsInRange,
    newUnlimitedInRange,
    cancelledSubsInRange,
    cancelledUnlimitedInRange,
    activeSubsAtStart,
    activeUnlimitedAtStart,
    failedSubs,
    failedUnlimited,
    refundsSum,
    pendingPayouts,
    paidPayouts,
    revenueByCreatorRaw,
    dailyRevenue,
  ] = await Promise.all([
    db.ledgerEntry.aggregate({ _sum: { grossAmount: true } }),
    db.ledgerEntry.aggregate({ where: inRange, _sum: { grossAmount: true } }),
    inPrevRange ? db.ledgerEntry.aggregate({ where: inPrevRange, _sum: { grossAmount: true } }) : Promise.resolve(null),
    db.ledgerEntry.aggregate({ _sum: { creatorShareAmount: true, platformShareAmount: true } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.unlimitedSubscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.aggregate({ where: { status: "ACTIVE" }, _sum: { priceUsdAtPurchase: true } }),
    db.unlimitedSubscription.aggregate({ where: { status: "ACTIVE" }, _sum: { priceUsdAtPurchase: true } }),
    db.subscription.count({ where: since ? { startedAt: { gte: since } } : {} }),
    db.unlimitedSubscription.count({ where: since ? { startedAt: { gte: since } } : {} }),
    db.subscription.count({ where: cancelledInRangeWhere }),
    db.unlimitedSubscription.count({ where: cancelledInRangeWhere }),
    activeAtStartWhere ? db.subscription.count({ where: activeAtStartWhere }) : Promise.resolve(0),
    activeAtStartWhere ? db.unlimitedSubscription.count({ where: activeAtStartWhere }) : Promise.resolve(0),
    db.subscription.count({ where: { status: "PAYMENT_FAILED" } }),
    db.unlimitedSubscription.count({ where: { status: "PAYMENT_FAILED" } }),
    db.ledgerEntry.aggregate({ where: { type: "REFUND" }, _sum: { grossAmount: true } }),
    db.payout.aggregate({ where: { status: "REQUESTED" }, _count: { _all: true }, _sum: { amountUsd: true } }),
    db.payout.aggregate({ where: { status: "PAID" }, _count: { _all: true }, _sum: { amountUsd: true } }),
    db.ledgerEntry.groupBy({
      by: ["creatorProfileId"],
      where: { creatorProfileId: { not: null } },
      _sum: { creatorShareAmount: true },
      orderBy: { _sum: { creatorShareAmount: "desc" } },
      take: 20,
    }),
    since
      ? db.$queryRaw<{ day: Date; gross: string }[]>(
          Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("grossAmount"), 0)::text AS gross FROM ledger_entries WHERE "createdAt" >= ${since} GROUP BY day ORDER BY day ASC`
        )
      : db.$queryRaw<{ day: Date; gross: string }[]>(
          Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("grossAmount"), 0)::text AS gross FROM ledger_entries GROUP BY day ORDER BY day ASC`
        ),
  ]);

  const creatorIds = revenueByCreatorRaw.map((r) => r.creatorProfileId).filter((id): id is string => Boolean(id));
  const creatorsWithNames = creatorIds.length
    ? await db.creatorProfile.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, user: { select: { email: true, profile: { select: { displayName: true } } } } },
      })
    : [];
  const creatorInfoById = new Map(creatorsWithNames.map((c) => [c.id, { email: c.user.email, displayName: c.user.profile?.displayName ?? null }]));

  const cancelledInRange = cancelledSubsInRange + cancelledUnlimitedInRange;
  const activeAtStart = activeSubsAtStart + activeUnlimitedAtStart;

  return NextResponse.json({
    range,
    summary: {
      grossAllTimeUsd: (grossAllTime._sum.grossAmount ?? 0).toString(),
      grossInRangeUsd: (grossInRange._sum.grossAmount ?? 0).toString(),
      grossDeltaPct: grossPrevRange ? pctChange(Number(grossInRange._sum.grossAmount ?? 0), Number(grossPrevRange._sum.grossAmount ?? 0)) : null,
      creatorShareAllTimeUsd: (shareAllTime._sum.creatorShareAmount ?? 0).toString(),
      platformShareAllTimeUsd: (shareAllTime._sum.platformShareAmount ?? 0).toString(),
      mrrUsd: (Number(activeSubsSum._sum.priceUsdAtPurchase ?? 0) + Number(activeUnlimitedSum._sum.priceUsdAtPurchase ?? 0)).toFixed(2),
      refundsAllTimeUsd: (refundsSum._sum.grossAmount ?? 0).toString(),
    },
    subscriptions: {
      activeCreatorSubs: activeSubs,
      activeVipPass: activeUnlimited,
      newInRange: newSubsInRange + newUnlimitedInRange,
      cancelledInRange,
      churnRatePct: since ? ratePercent(cancelledInRange, activeAtStart) : null,
      failedPayments: failedSubs + failedUnlimited,
    },
    payouts: {
      pendingCount: pendingPayouts._count._all,
      pendingAmountUsd: (pendingPayouts._sum.amountUsd ?? 0).toString(),
      paidCount: paidPayouts._count._all,
      paidAmountUsd: (paidPayouts._sum.amountUsd ?? 0).toString(),
    },
    revenueByCreator: revenueByCreatorRaw
      .filter((r) => r.creatorProfileId)
      .map((r) => ({
        creatorProfileId: r.creatorProfileId!,
        email: creatorInfoById.get(r.creatorProfileId!)?.email ?? "unknown",
        displayName: creatorInfoById.get(r.creatorProfileId!)?.displayName ?? null,
        revenueUsd: Number(r._sum.creatorShareAmount ?? 0).toFixed(2),
      })),
    chart: dailyRevenue.map((r) => ({ date: r.day.toISOString().slice(0, 10), gross: Number(r.gross) })),
  });
}
