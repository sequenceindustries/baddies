import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Admin dashboard Overview tab's one aggregate call — every count/sum a
 * fetch away rather than the admin inferring platform health from
 * scrolling several separate queues. Read-only, several independent
 * queries run concurrently (Promise.all) rather than one giant join.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "dashboard:view");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    usersByRole,
    activeUsers,
    suspendedUsers,
    newUsers7d,
    newUsers30d,
    creatorsByStatus,
    foundingByStatus,
    contentByModerationStatus,
    pendingModerationCount,
    openModerationCases,
    openReports,
    pendingPayouts,
    revenueAllTime,
    revenue7d,
    payoutsAllTime,
  ] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.user.count({ where: { isActive: true } }),
    db.user.count({ where: { isActive: false } }),
    db.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.creatorProfile.groupBy({ by: ["status"], _count: { _all: true } }),
    db.foundingApplication.groupBy({ by: ["status"], _count: { _all: true } }),
    db.content.groupBy({ by: ["moderationStatus"], _count: { _all: true } }),
    db.content.count({ where: { moderationStatus: "PENDING_REVIEW" } }),
    db.moderationCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } } }),
    db.report.count(),
    db.payout.aggregate({
      where: { status: "REQUESTED" },
      _count: { _all: true },
      _sum: { amountUsd: true },
    }),
    db.ledgerEntry.aggregate({
      _sum: { grossAmount: true, platformShareAmount: true, creatorShareAmount: true },
    }),
    db.ledgerEntry.aggregate({
      where: { createdAt: { gte: sevenDaysAgo } },
      _sum: { grossAmount: true },
    }),
    db.payout.aggregate({ where: { status: "PAID" }, _sum: { amountUsd: true } }),
  ]);

  const countsByKey = <Row extends { _count: { _all: number } }, K extends string>(
    rows: Row[],
    keys: K[],
    pick: (row: Row) => K
  ) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    for (const row of rows) out[pick(row)] = row._count._all;
    return out;
  };

  return NextResponse.json({
    users: {
      total: activeUsers + suspendedUsers,
      byRole: countsByKey(usersByRole, ["FAN", "CREATOR", "ADMIN"], (r) => r.role),
      active: activeUsers,
      suspended: suspendedUsers,
      new7d: newUsers7d,
      new30d: newUsers30d,
    },
    creators: {
      byStatus: countsByKey(
        creatorsByStatus,
        ["PENDING", "VERIFICATION_REQUIRED", "UNDER_REVIEW", "VERIFIED", "SUSPENDED", "REJECTED", "BANNED"],
        (r) => r.status
      ),
    },
    foundingApplications: {
      total: foundingByStatus.reduce((sum, r) => sum + r._count._all, 0),
      byStatus: countsByKey(
        foundingByStatus,
        ["APPLIED", "REVIEWED", "APPROVED", "VERIFICATION_PENDING", "VERIFIED", "ONBOARDING", "LIVE", "REJECTED"],
        (r) => r.status
      ),
    },
    content: {
      total: contentByModerationStatus.reduce((sum, r) => sum + r._count._all, 0),
      pendingModeration: pendingModerationCount,
      byModerationStatus: countsByKey(
        contentByModerationStatus,
        ["DRAFT", "UPLOADED", "PROCESSING", "PENDING_REVIEW", "APPROVED", "REJECTED", "REMOVED"],
        (r) => r.moderationStatus
      ),
    },
    trustAndSafety: {
      openModerationCases,
      totalReports: openReports,
    },
    payouts: {
      pendingCount: pendingPayouts._count._all,
      pendingAmountUsd: pendingPayouts._sum.amountUsd?.toString() ?? "0",
      paidAllTimeUsd: payoutsAllTime._sum.amountUsd?.toString() ?? "0",
    },
    revenue: {
      grossAllTimeUsd: revenueAllTime._sum.grossAmount?.toString() ?? "0",
      platformShareAllTimeUsd: revenueAllTime._sum.platformShareAmount?.toString() ?? "0",
      creatorShareAllTimeUsd: revenueAllTime._sum.creatorShareAmount?.toString() ?? "0",
      gross7dUsd: revenue7d._sum.grossAmount?.toString() ?? "0",
    },
  });
}
