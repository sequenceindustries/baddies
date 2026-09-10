import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Backs the /messages launcher (social-feed redesign, Phase 4) — there's
 * no real inbox yet (explicit scope decision, see the plan's Context
 * section), so rather than a fake thread list this returns exactly the
 * creators a fan can actually message right now.
 *
 * Narrowed to active-subscription-only (dropped "everyone they follow"):
 * POST /api/creators/:id/message now requires a real, currently-active
 * subscription (direct request: "fans can only message creators theyre
 * subscribe to") — listing a merely-followed creator here would show a
 * Message button that 403s the instant it's tapped. `currentPeriodEnd`
 * is checked too, matching the authoritative shape
 * canAccessContent/the message route itself use — this route previously
 * checked `status:"ACTIVE"` alone, which could list a lapsed-but-not-
 * yet-flipped subscription as messageable.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const subscriptions = await db.subscription.findMany({
    where: { fanId: user.id, status: "ACTIVE", currentPeriodEnd: { gte: new Date() } },
    select: { creatorProfileId: true },
  });

  const creatorProfileIds = Array.from(
    new Set(subscriptions.map((s: (typeof subscriptions)[number]) => s.creatorProfileId))
  );

  if (creatorProfileIds.length === 0) {
    return NextResponse.json({ creators: [] });
  }

  const creators = await db.creatorProfile.findMany({
    where: { id: { in: creatorProfileIds }, acceptsMessages: true },
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

  const shaped = await Promise.all(
    creators.map(async (c: (typeof creators)[number]) => ({
      creatorProfileId: c.id,
      displayName: c.user.profile?.displayName ?? null,
      avatarUrl: (await resolveDisplayUrl(c.user.profile?.avatarUrl)) ?? null,
      isFoundingPartner: c.user.foundingPartner !== null,
      isFoundingBaddie: c.isFoundingBaddie,
    }))
  );

  return NextResponse.json({ creators: shaped });
}
