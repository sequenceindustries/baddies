import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { UserRole } from "@prisma/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ROLES: UserRole[] = ["FAN", "CREATOR", "ADMIN"];

/**
 * The Members/Creators tabs' directory listing — search/filter/
 * paginate every user, replacing the old exact-email-only lookup box
 * (still the mechanism Suspend/Ban act on). Cursor pagination, same
 * shape as the audit log route. The Creators tab is this same list,
 * locked to role=CREATOR client-side — no separate endpoint.
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

  const params = req.nextUrl.searchParams;
  const query = params.get("query")?.trim();
  const roleParam = params.get("role");
  const role = roleParam && ROLES.includes(roleParam as UserRole) ? (roleParam as UserRole) : undefined;
  const statusParam = params.get("status"); // "active" | "suspended"
  const founding = params.get("founding") === "true";
  const verified = params.get("verified") === "true";
  const newDaysParam = params.get("newDays"); // "7" | "30"
  const newDays = newDaysParam === "7" || newDaysParam === "30" ? Number(newDaysParam) : null;
  const cursor = params.get("cursor") ?? undefined;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(statusParam === "active" ? { isActive: true } : {}),
    ...(statusParam === "suspended" ? { isActive: false } : {}),
    ...(verified ? { creatorProfile: { status: "VERIFIED" } } : {}),
    ...(newDays ? { createdAt: { gte: new Date(Date.now() - newDays * 24 * 60 * 60 * 1000) } } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { profile: { displayName: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const rows = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // founding=true can't be expressed in `where` (FoundingApplication
    // has no FK to User — see its own schema comment) so it's applied
    // as an in-memory filter below, after the founding-email set is
    // known. Overfetch a wide page so filtering afterward still leaves
    // a full page in the common case; a founding-only search on a
    // large user base would need real pagination support later.
    take: founding ? PAGE_SIZE * 4 : PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { profile: { select: { displayName: true } }, creatorProfile: { select: { id: true, status: true } } },
  });

  let candidates = rows;
  let foundingEmails: Set<string> | null = null;
  if (founding) {
    const applications = await db.foundingApplication.findMany({
      where: { email: { in: rows.map((r) => r.email) } },
      select: { email: true },
    });
    foundingEmails = new Set(applications.map((a) => a.email.toLowerCase()));
    candidates = rows.filter((r) => foundingEmails!.has(r.email.toLowerCase()));
  }

  const hasMore = founding ? false : candidates.length > PAGE_SIZE;
  const page = founding ? candidates.slice(0, PAGE_SIZE) : hasMore ? candidates.slice(0, PAGE_SIZE) : candidates;

  // Batched enrichment for just this page — never per-row queries.
  const userIds = page.map((u) => u.id);
  const creatorProfileIds = page.map((u) => u.creatorProfile?.id).filter((id): id is string => Boolean(id));
  const emails = page.map((u) => u.email);

  const [lastSessions, foundingMatches, contentCounts, subscriberCounts, revenueSums, purchaseSums, tipSums] = await Promise.all([
    userIds.length
      ? db.$queryRaw<{ userId: string; lastSessionAt: Date }[]>(
          Prisma.sql`SELECT DISTINCT ON ("userId") "userId", "createdAt" AS "lastSessionAt" FROM sessions WHERE "userId" IN (${Prisma.join(userIds)}) AND "revokedAt" IS NULL ORDER BY "userId", "createdAt" DESC`
        )
      : Promise.resolve([]),
    foundingEmails
      ? Promise.resolve([...foundingEmails])
      : db.foundingApplication.findMany({ where: { email: { in: emails } }, select: { email: true } }).then((rows) => rows.map((r) => r.email.toLowerCase())),
    creatorProfileIds.length
      ? db.content.groupBy({ by: ["creatorProfileId"], where: { creatorProfileId: { in: creatorProfileIds } }, _count: { _all: true } })
      : Promise.resolve([]),
    creatorProfileIds.length
      ? db.subscription.groupBy({ by: ["creatorProfileId"], where: { creatorProfileId: { in: creatorProfileIds }, status: "ACTIVE" }, _count: { _all: true } })
      : Promise.resolve([]),
    creatorProfileIds.length
      ? db.ledgerEntry.groupBy({ by: ["creatorProfileId"], where: { creatorProfileId: { in: creatorProfileIds } }, _sum: { creatorShareAmount: true } })
      : Promise.resolve([]),
    userIds.length ? db.purchase.groupBy({ by: ["fanId"], where: { fanId: { in: userIds } }, _sum: { priceUsd: true } }) : Promise.resolve([]),
    userIds.length ? db.tip.groupBy({ by: ["fanId"], where: { fanId: { in: userIds } }, _sum: { amountUsd: true } }) : Promise.resolve([]),
  ]);

  const lastSessionByUser = new Map(lastSessions.map((s) => [s.userId, s.lastSessionAt]));
  const foundingEmailSet = new Set(foundingMatches);
  const contentByCreator = new Map(contentCounts.map((c) => [c.creatorProfileId, c._count._all]));
  const subsByCreator = new Map(subscriberCounts.map((c) => [c.creatorProfileId, c._count._all]));
  const revenueByCreator = new Map(revenueSums.map((c) => [c.creatorProfileId, Number(c._sum.creatorShareAmount ?? 0)]));
  const purchasesByFan = new Map(purchaseSums.map((p) => [p.fanId, Number(p._sum.priceUsd ?? 0)]));
  const tipsByFan = new Map(tipSums.map((t) => [t.fanId, Number(t._sum.amountUsd ?? 0)]));

  return NextResponse.json({
    users: page.map((u) => ({
      userId: u.id,
      email: u.email,
      role: u.role,
      displayName: u.profile?.displayName ?? null,
      isActive: u.isActive,
      suspendedAt: u.suspendedAt,
      creatorProfileStatus: u.creatorProfile?.status ?? null,
      createdAt: u.createdAt,
      lastSessionAt: lastSessionByUser.get(u.id) ?? null,
      foundingBaddie: foundingEmailSet.has(u.email.toLowerCase()),
      creatorStats: u.creatorProfile
        ? {
            contentCount: contentByCreator.get(u.creatorProfile.id) ?? 0,
            activeSubscribers: subsByCreator.get(u.creatorProfile.id) ?? 0,
            revenueUsd: (revenueByCreator.get(u.creatorProfile.id) ?? 0).toFixed(2),
          }
        : null,
      fanStats: !u.creatorProfile
        ? {
            purchasesUsd: (purchasesByFan.get(u.id) ?? 0).toFixed(2),
            tipsUsd: (tipsByFan.get(u.id) ?? 0).toFixed(2),
          }
        : null,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
