import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { ModerationCaseStatus } from "@prisma/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const CASE_STATUSES: ModerationCaseStatus[] = ["OPEN", "IN_REVIEW", "ESCALATED", "UPHELD", "APPEALED", "RESOLVED", "DISMISSED"];
const OPEN_STATUSES: ModerationCaseStatus[] = ["OPEN", "IN_REVIEW", "ESCALATED"];

/**
 * Trust & Safety's one data source — the moderation case queue (every
 * Report opens exactly one ModerationCase, see src/app/api/reports/
 * route.ts's own transaction, so this is the single list rather than
 * reconciling reports and cases separately) plus a summary block for
 * the tab's stat row.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "report:review");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const params = req.nextUrl.searchParams;
  const statusParam = params.get("status");
  const status = statusParam && CASE_STATUSES.includes(statusParam as ModerationCaseStatus) ? (statusParam as ModerationCaseStatus) : undefined;
  const cursor = params.get("cursor") ?? undefined;

  const [cases, openCases, totalReports, pendingReports, resolvedReports, suspendedCreators, bannedCreators, latestAccountActions, flaggedContentIds] =
    await Promise.all([
      db.moderationCase.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          report: { include: { reporter: { select: { email: true } } } },
          content: { select: { id: true, caption: true, creatorProfile: { select: { user: { select: { email: true } } } } } },
        },
      }),
      db.moderationCase.count({ where: { status: { in: OPEN_STATUSES } } }),
      db.report.count(),
      db.moderationCase.count({ where: { status: "OPEN" } }),
      db.moderationCase.count({ where: { status: { in: ["RESOLVED", "DISMISSED"] } } }),
      db.creatorProfile.count({ where: { status: "SUSPENDED" } }),
      db.creatorProfile.count({ where: { status: "BANNED" } }),
      // Latest user.suspend/user.ban AuditLog action per target user —
      // the only honest way to tell suspended from banned for accounts
      // with no CreatorProfile (see this session's plan file).
      db.$queryRaw<{ targetId: string; action: string }[]>(
        Prisma.sql`SELECT DISTINCT ON ("targetId") "targetId", action FROM audit_logs WHERE action IN ('user.suspend', 'user.ban') AND "targetId" IS NOT NULL ORDER BY "targetId", "createdAt" DESC`
      ),
      db.moderationCase.findMany({ where: { status: { in: OPEN_STATUSES }, contentId: { not: null } }, select: { contentId: true }, distinct: ["contentId"] }),
    ]);

  // Reconcile the audit-log-derived suspend/ban tally against who is
  // actually inactive right now (an admin could theoretically flip
  // isActive back on directly with no dedicated "reactivate" route).
  const inactiveUserIds = latestAccountActions.length
    ? new Set(
        (
          await db.user.findMany({
            where: { id: { in: latestAccountActions.map((a) => a.targetId) }, isActive: false },
            select: { id: true },
          })
        ).map((u) => u.id)
      )
    : new Set<string>();
  let suspendedFans = 0;
  let bannedFans = 0;
  for (const a of latestAccountActions) {
    if (!inactiveUserIds.has(a.targetId)) continue;
    if (a.action === "user.ban") bannedFans++;
    else suspendedFans++;
  }

  const hasMore = cases.length > PAGE_SIZE;
  const page = hasMore ? cases.slice(0, PAGE_SIZE) : cases;

  const adminIds = [...new Set(page.map((c) => c.assignedToAdminId).filter((id): id is string => Boolean(id)))];
  const admins = adminIds.length ? await db.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } }) : [];
  const adminEmailById = new Map(admins.map((a) => [a.id, a.email]));

  // A report can target a user directly instead of a piece of content
  // (moderationCase.create only ever sets contentId — see reports/
  // route.ts — so reportedUserId lives only on the Report row; resolve
  // those emails here as a fallback target).
  const reportedUserIds = [...new Set(page.map((c) => c.report?.reportedUserId).filter((id): id is string => Boolean(id)))];
  const reportedUsers = reportedUserIds.length ? await db.user.findMany({ where: { id: { in: reportedUserIds } }, select: { id: true, email: true } }) : [];
  const reportedUserEmailById = new Map(reportedUsers.map((u) => [u.id, u.email]));

  return NextResponse.json({
    summary: {
      openCases,
      totalReports,
      pendingReports,
      resolvedReports,
      // Creator counts are exact (CreatorProfile.status is a real,
      // distinct field); fan counts are audit-log-derived — both real,
      // neither fabricated, just different sources.
      suspendedAccounts: suspendedCreators + suspendedFans,
      bannedAccounts: bannedCreators + bannedFans,
      flaggedContent: flaggedContentIds.length,
    },
    cases: page.map((c) => ({
      caseId: c.id,
      status: c.status,
      escalated: c.escalated,
      resolutionNotes: c.resolutionNotes,
      assignedToAdminEmail: c.assignedToAdminId ? adminEmailById.get(c.assignedToAdminId) ?? null : null,
      createdAt: c.createdAt,
      resolvedAt: c.resolvedAt,
      report: c.report
        ? { reportId: c.report.id, reason: c.report.reason, details: c.report.details, reporterEmail: c.report.reporter.email }
        : null,
      target: c.content
        ? { type: "content" as const, contentId: c.content.id, caption: c.content.caption, creatorEmail: c.content.creatorProfile.user.email }
        : c.report?.reportedUserId
          ? { type: "user" as const, userId: c.report.reportedUserId, email: reportedUserEmailById.get(c.report.reportedUserId) ?? "unknown" }
          : { type: "unknown" as const },
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
