import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { pctChange, rangeBounds, RANGES, type Range } from "@/lib/analytics/rates";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

async function dailyCounts(table: "users" | "creator_profiles" | "content", dateColumn: string, since: Date | null) {
  const rows = await db.$queryRaw<{ day: Date; count: bigint }[]>(
    since
      ? Prisma.sql`SELECT date_trunc('day', ${Prisma.raw(`"${dateColumn}"`)}) AS day, COUNT(*)::bigint AS count FROM ${Prisma.raw(table)} WHERE ${Prisma.raw(`"${dateColumn}"`)} >= ${since} GROUP BY day ORDER BY day ASC`
      : Prisma.sql`SELECT date_trunc('day', ${Prisma.raw(`"${dateColumn}"`)}) AS day, COUNT(*)::bigint AS count FROM ${Prisma.raw(table)} GROUP BY day ORDER BY day ASC`
  );
  return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}

/**
 * The admin Command Centre's single data source (Overview tab) — KPIs,
 * an Action Required list, growth charts,
 * and a recent-activity feed, all from real queries. See
 * .claude/plans (this session) for the full design rationale: no
 * fabricated numbers — a metric with nothing behind it reads as 0 or
 * "—", never an invented figure.
 */
export async function GET(req: NextRequest) {
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

  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: Range = RANGES.includes(rangeParam as Range) ? (rangeParam as Range) : "7d";
  const now = new Date();
  const { since, prevSince, prevUntil } = rangeBounds(range, now);
  const inRange = since ? { createdAt: { gte: since } } : {};
  const inPrevRange = prevSince && prevUntil ? { createdAt: { gte: prevSince, lt: prevUntil } } : null;

  const [
    totalUsers,
    newUsers,
    newUsersPrev,
    activeAccounts,
    totalCreators,
    newCreators,
    newCreatorsPrev,
    totalFans,
    activeSubs,
    activeUnlimitedSubs,
    activeSubsSum,
    activeUnlimitedSubsSum,
    totalContent,
    newContent,
    newContentPrev,
    revenueInRange,
    revenuePrev,
    revenueAllTime,
    openModerationCases,
    pendingCreatorReview,
    pendingPayouts,
    pendingContentModeration,
    usersByDay,
    creatorsByDay,
    contentByDay,
    recentAuditLogs,
    recentUsers,
    recentContent,
    recentApprovals,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: inRange }),
    inPrevRange ? db.user.count({ where: inPrevRange }) : Promise.resolve(0),
    db.user.count({ where: { isActive: true } }),
    db.creatorProfile.count(),
    db.creatorProfile.count({ where: since ? { appliedAt: { gte: since } } : {} }),
    inPrevRange ? db.creatorProfile.count({ where: { appliedAt: { gte: prevSince!, lt: prevUntil! } } }) : Promise.resolve(0),
    db.user.count({ where: { role: "FAN" } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.unlimitedSubscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.aggregate({ where: { status: "ACTIVE" }, _sum: { priceUsdAtPurchase: true } }),
    db.unlimitedSubscription.aggregate({ where: { status: "ACTIVE" }, _sum: { priceUsdAtPurchase: true } }),
    db.content.count(),
    db.content.count({ where: inRange }),
    inPrevRange ? db.content.count({ where: inPrevRange }) : Promise.resolve(0),
    db.ledgerEntry.aggregate({ where: inRange, _sum: { grossAmount: true } }),
    inPrevRange ? db.ledgerEntry.aggregate({ where: inPrevRange, _sum: { grossAmount: true } }) : Promise.resolve(null),
    db.ledgerEntry.aggregate({ _sum: { grossAmount: true } }),
    db.moderationCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } } }),
    db.creatorProfile.count({ where: { status: { in: ["VERIFICATION_REQUIRED", "UNDER_REVIEW"] } } }),
    db.payout.count({ where: { status: "REQUESTED" } }),
    // Matches the filter ContentQueue's own API route actually uses
    // (status, not moderationStatus) — see /api/admin/content/route.ts.
    db.content.count({ where: { status: "PENDING_REVIEW" } }),
    dailyCounts("users", "createdAt", since),
    dailyCounts("creator_profiles", "appliedAt", since),
    dailyCounts("content", "createdAt", since),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { email: true } } } }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, email: true, createdAt: true } }),
    db.content.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, mediaType: true, createdAt: true, creatorProfile: { select: { user: { select: { email: true } } } } },
    }),
    db.creatorProfile.findMany({
      where: { approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 10,
      select: { id: true, approvedAt: true, user: { select: { email: true } } },
    }),
  ]);

  const activeSubscriptionsCount = activeSubs + activeUnlimitedSubs;
  const mrrUsd =
    Number(activeSubsSum._sum.priceUsdAtPurchase ?? 0) + Number(activeUnlimitedSubsSum._sum.priceUsdAtPurchase ?? 0);

  const actionRequired = [
    { id: "creator-review", label: "Creator application(s) awaiting review", count: pendingCreatorReview, linkTab: "Applications" as const },
    { id: "content-moderation", label: "Content item(s) pending moderation", count: pendingContentModeration, linkTab: "Content" as const },
    { id: "payouts", label: "Payout request(s) pending", count: pendingPayouts, linkTab: "Payouts" as const },
    { id: "moderation", label: "Open moderation case(s)", count: openModerationCases, linkTab: "Trust & Safety" as const },
  ].filter((item) => item.count > 0);

  const recentActivity = [
    ...recentAuditLogs.map((a) => ({
      id: `audit:${a.id}`,
      kind: "admin_action",
      label: a.action.replace(/[._]/g, " "),
      actor: a.actor?.email ?? "system",
      timestamp: a.createdAt.toISOString(),
    })),
    ...recentUsers.map((u) => ({
      id: `user:${u.id}`,
      kind: "signup",
      label: "New account registered",
      actor: u.email,
      timestamp: u.createdAt.toISOString(),
    })),
    ...recentContent.map((c) => ({
      id: `content:${c.id}`,
      kind: "content",
      label: `New ${c.mediaType.toLowerCase()} uploaded`,
      actor: c.creatorProfile.user.email,
      timestamp: c.createdAt.toISOString(),
    })),
    ...recentApprovals.map((c) => ({
      id: `approval:${c.id}`,
      kind: "creator_approved",
      label: "Creator approved",
      actor: c.user.email,
      timestamp: c.approvedAt!.toISOString(),
    })),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  return NextResponse.json({
    range,
    kpis: {
      totalUsers: { value: totalUsers, newInRange: newUsers, deltaPct: pctChange(newUsers, newUsersPrev) },
      activeAccounts: { value: activeAccounts },
      creators: { value: totalCreators, newInRange: newCreators, deltaPct: pctChange(newCreators, newCreatorsPrev) },
      fans: { value: totalFans },
      activeSubscriptions: { value: activeSubscriptionsCount },
      revenue: {
        inRangeUsd: (revenueInRange._sum.grossAmount ?? 0).toString(),
        allTimeUsd: (revenueAllTime._sum.grossAmount ?? 0).toString(),
        deltaPct: revenuePrev
          ? pctChange(Number(revenueInRange._sum.grossAmount ?? 0), Number(revenuePrev._sum.grossAmount ?? 0))
          : null,
      },
      mrrUsd: mrrUsd.toFixed(2),
      content: { value: totalContent, newInRange: newContent, deltaPct: pctChange(newContent, newContentPrev) },
      openIssues: openModerationCases + pendingCreatorReview + pendingPayouts,
    },
    actionRequired,
    // Raw counts (unfiltered, unlike actionRequired above) for the nav
    // bar's small badge pills.
    badges: {
      applications: pendingCreatorReview,
      content: pendingContentModeration,
      payouts: pendingPayouts,
      trustSafety: openModerationCases,
    },
    charts: {
      newUsers: usersByDay,
      newCreators: creatorsByDay,
      newContent: contentByDay,
    },
    recentActivity,
  });
}
