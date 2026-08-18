import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The current fan's own subscriptions and PPV purchases — the "My
 * Subscriptions" view. Only ever returns the caller's own records; no
 * other fan's purchase history is ever exposed here.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const [subscriptions, purchases] = await Promise.all([
    db.subscription.findMany({
      where: { fanId: user.id },
      orderBy: { startedAt: "desc" },
    }),
    db.purchase.findMany({
      where: { fanId: user.id },
      orderBy: { createdAt: "desc" },
      include: { content: { select: { id: true, caption: true, creatorProfileId: true } } },
    }),
  ]);

  // Subscription has no Prisma relation to CreatorProfile (only the raw
  // FK column), so display names are resolved with a separate batch query
  // rather than an include.
  const creatorIds = Array.from(new Set(subscriptions.map((s: (typeof subscriptions)[number]) => s.creatorProfileId)));
  const creators = await db.creatorProfile.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, user: { select: { profile: { select: { displayName: true } } } } },
  });
  const nameById = new Map(creators.map((c: (typeof creators)[number]) => [c.id, c.user.profile?.displayName ?? null]));

  return NextResponse.json({
    subscriptions: subscriptions.map((s: (typeof subscriptions)[number]) => ({
      subscriptionId: s.id,
      creatorProfileId: s.creatorProfileId,
      creatorDisplayName: nameById.get(s.creatorProfileId) ?? null,
      tier: s.tier,
      status: s.status,
      priceUsdAtPurchase: Number(s.priceUsdAtPurchase),
      currentPeriodEnd: s.currentPeriodEnd,
      cancelledAt: s.cancelledAt,
    })),
    purchases: purchases.map((p: (typeof purchases)[number]) => ({
      purchaseId: p.id,
      contentId: p.contentId,
      caption: p.content.caption,
      creatorProfileId: p.content.creatorProfileId,
      priceUsd: Number(p.priceUsd),
      createdAt: p.createdAt,
      refunded: p.refundedAt != null,
    })),
  });
}
