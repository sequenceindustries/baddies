import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Backs the /messages launcher (social-feed redesign, Phase 4) — there's
 * no real inbox yet (explicit scope decision, see the plan's Context
 * section), so rather than a fake thread list this returns exactly the
 * creators a fan could plausibly already have a real relationship
 * with: everyone they follow, plus everyone they have an active
 * Exclusive subscription to. Composed from the same Follow/Subscription
 * queries already used elsewhere (GET /api/feed, GET /api/fan/
 * subscriptions) rather than any new query shape — just merged and
 * deduplicated for this one listing.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const [follows, subscriptions] = await Promise.all([
    db.follow.findMany({ where: { fanId: user.id }, select: { creatorProfileId: true } }),
    db.subscription.findMany({
      where: { fanId: user.id, status: "ACTIVE" },
      select: { creatorProfileId: true },
    }),
  ]);

  const creatorProfileIds = Array.from(
    new Set([
      ...follows.map((f: (typeof follows)[number]) => f.creatorProfileId),
      ...subscriptions.map((s: (typeof subscriptions)[number]) => s.creatorProfileId),
    ])
  );

  if (creatorProfileIds.length === 0) {
    return NextResponse.json({ creators: [] });
  }

  const creators = await db.creatorProfile.findMany({
    where: { id: { in: creatorProfileIds } },
    select: {
      id: true,
      isFoundingBaddie: true,
      user: {
        select: {
          profile: { select: { displayName: true, avatarUrl: true } },
          foundingPartner: { select: { id: true } },
        },
      },
    },
  });

  return NextResponse.json({
    creators: creators.map((c: (typeof creators)[number]) => ({
      creatorProfileId: c.id,
      displayName: c.user.profile?.displayName ?? null,
      avatarUrl: c.user.profile?.avatarUrl ?? null,
      isFoundingPartner: c.user.foundingPartner !== null,
      isFoundingBaddie: c.isFoundingBaddie,
    })),
  });
}
