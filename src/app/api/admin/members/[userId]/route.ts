import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The Members/Creators detail panel's one call — a single user's full
 * picture. See src/app/(admin)/admin/page.tsx's MemberDetailView, and
 * this session's plan file for which numbers are real vs. deliberately
 * omitted (no cumulative "total spend" field — there's no payment-
 * history table to back one, so it's Purchases/Tips/active-subscriptions
 * shown separately instead of one invented total).
 */
export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(admin.role, "dashboard:view");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const user = await db.user.findUnique({
    where: { id: params.userId },
    include: {
      profile: true,
      creatorProfile: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const [
    foundingApplication,
    lastSession,
    recentActivity,
    reportsFiled,
    reportsAgainst,
    contentCount,
    activeSubscribers,
    revenueSum,
    recentContent,
    purchaseSum,
    tipSum,
    activeSubscriptions,
    activeUnlimitedSub,
    recentPurchases,
    recentTips,
  ] = await Promise.all([
    db.foundingApplication.findFirst({ where: { email: user.email }, orderBy: { createdAt: "desc" } }),
    db.session.findFirst({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { createdAt: true, ipAddress: true } }),
    db.auditLog.findMany({
      where: { OR: [{ actorId: user.id }, { targetId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actor: { select: { email: true } } },
    }),
    db.report.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.report.findMany({ where: { reportedUserId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    user.creatorProfile ? db.content.count({ where: { creatorProfileId: user.creatorProfile.id } }) : Promise.resolve(0),
    user.creatorProfile ? db.subscription.count({ where: { creatorProfileId: user.creatorProfile.id, status: "ACTIVE" } }) : Promise.resolve(0),
    user.creatorProfile
      ? db.ledgerEntry.aggregate({ where: { creatorProfileId: user.creatorProfile.id }, _sum: { creatorShareAmount: true } })
      : Promise.resolve(null),
    user.creatorProfile
      ? db.content.findMany({
          where: { creatorProfileId: user.creatorProfile.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, mediaType: true, accessLevel: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),
    db.purchase.aggregate({ where: { fanId: user.id }, _sum: { priceUsd: true } }),
    db.tip.aggregate({ where: { fanId: user.id }, _sum: { amountUsd: true } }),
    // Itemized (MASTER REQUIREMENTS §16 "Subscriptions" wants which
    // creators, not just a count). Subscription.creatorProfileId is a
    // plain FK column with no declared Prisma relation (confirmed by
    // reading the schema directly) — the creator's display name is
    // batch-fetched separately below rather than joined here.
    db.subscription.findMany({
      where: { fanId: user.id, status: "ACTIVE" },
      select: { creatorProfileId: true, priceUsdAtPurchase: true, currentPeriodEnd: true },
    }),
    db.unlimitedSubscription.findFirst({ where: { fanId: user.id, status: "ACTIVE" }, select: { priceUsdAtPurchase: true, currentPeriodEnd: true } }),
    // Itemized payment history (§16 "Payment history") — the same
    // fan-scoped where clause as the aggregates above, just findMany
    // instead of aggregate. Merged with tips and sorted client-side
    // (below) rather than a raw SQL UNION for what's a small, bounded
    // admin-facing list.
    db.purchase.findMany({
      where: { fanId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, priceUsd: true, createdAt: true, refundedAt: true },
    }),
    db.tip.findMany({
      where: { fanId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amountUsd: true, createdAt: true },
    }),
  ]);

  // Batch-fetch the display names for the subscribed-to creators — see
  // the query above's own comment on why this isn't a join.
  const subscribedCreatorProfiles =
    activeSubscriptions.length > 0
      ? await db.creatorProfile.findMany({
          where: { id: { in: activeSubscriptions.map((s) => s.creatorProfileId) } },
          select: { id: true, user: { select: { profile: { select: { displayName: true } } } } },
        })
      : [];
  const creatorNameById = new Map(subscribedCreatorProfiles.map((c) => [c.id, c.user.profile?.displayName ?? null]));

  // Merged, sorted payment history (§16) — Purchase and Tip are
  // separate tables with no shared base, so this is assembled here
  // rather than as a single query.
  const paymentHistory = [
    ...recentPurchases.map((p) => ({
      id: p.id,
      type: "purchase" as const,
      amountUsd: p.priceUsd.toString(),
      refunded: p.refundedAt !== null,
      createdAt: p.createdAt,
    })),
    ...recentTips.map((t) => ({
      id: t.id,
      type: "tip" as const,
      amountUsd: t.amountUsd.toString(),
      refunded: false,
      createdAt: t.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    role: user.role,
    displayName: user.profile?.displayName ?? null,
    bio: user.profile?.bio ?? null,
    country: user.profile?.country ?? null,
    city: user.profile?.city ?? null,
    isActive: user.isActive,
    suspendedAt: user.suspendedAt,
    ageVerified: user.ageVerified,
    ageVerifiedAt: user.ageVerifiedAt,
    emailVerified: user.emailVerified !== null,
    emailVerifiedAt: user.emailVerified,
    createdAt: user.createdAt,
    lastSession: lastSession ? { at: lastSession.createdAt, ipAddress: lastSession.ipAddress } : null,
    foundingApplication: foundingApplication
      ? { id: foundingApplication.id, status: foundingApplication.status, appliedAt: foundingApplication.createdAt }
      : null,
    creatorProfile: user.creatorProfile
      ? {
          status: user.creatorProfile.status,
          appliedAt: user.creatorProfile.appliedAt,
          approvedAt: user.creatorProfile.approvedAt,
          vvipPriceOverride: user.creatorProfile.vvipPriceOverride?.toString() ?? null,
          isLive: user.creatorProfile.isLive,
          contentCount,
          activeSubscribers,
          revenueUsd: (revenueSum?._sum.creatorShareAmount ? Number(revenueSum._sum.creatorShareAmount) : 0).toFixed(2),
          recentContent: recentContent.map((c) => ({
            id: c.id,
            mediaType: c.mediaType,
            accessLevel: c.accessLevel,
            status: c.status,
            createdAt: c.createdAt,
          })),
        }
      : null,
    fanFinancials: !user.creatorProfile
      ? {
          purchasesUsd: (purchaseSum._sum.priceUsd ? Number(purchaseSum._sum.priceUsd) : 0).toFixed(2),
          tipsUsd: (tipSum._sum.amountUsd ? Number(tipSum._sum.amountUsd) : 0).toFixed(2),
          activeCreatorSubscriptions: activeSubscriptions.length,
          activeVipPass: activeUnlimitedSub
            ? { priceUsd: activeUnlimitedSub.priceUsdAtPurchase.toString(), currentPeriodEnd: activeUnlimitedSub.currentPeriodEnd }
            : null,
          // Itemized — §16 "Subscriptions" wants which creators, not
          // just a count (activeCreatorSubscriptions above is kept too,
          // for the existing Overview summary line).
          subscriptions: activeSubscriptions.map((s) => ({
            creatorProfileId: s.creatorProfileId,
            creatorDisplayName: creatorNameById.get(s.creatorProfileId) ?? "Unknown creator",
            priceUsd: s.priceUsdAtPurchase.toString(),
            currentPeriodEnd: s.currentPeriodEnd,
          })),
          paymentHistory,
        }
      : null,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      action: a.action,
      actorEmail: a.actor?.email ?? "system",
      isActor: a.actorId === user.id,
      targetType: a.targetType,
      targetId: a.targetId,
      createdAt: a.createdAt,
    })),
    moderation: {
      reportsFiled: reportsFiled.map((r) => ({ id: r.id, reason: r.reason, createdAt: r.createdAt })),
      reportsAgainst: reportsAgainst.map((r) => ({ id: r.id, reason: r.reason, createdAt: r.createdAt })),
    },
  });
}
