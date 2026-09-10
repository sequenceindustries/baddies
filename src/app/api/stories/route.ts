import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 20;

/**
 * Creators who currently have at least one active (unexpired) story —
 * backs the feed's story avatar row. Any signed-in viewer, zero tier/
 * entitlement check of any kind (per direct request: stories aren't
 * gated by subscription). No Cache-Control header — unlike the genuinely
 * public discovery endpoints, this is auth-gated and the underlying data
 * is 24h-volatile, so a shared cache would be wrong here.
 *
 * findMany + in-memory de-dup by creator (not a Prisma groupBy) — no
 * groupBy-on-relation precedent exists anywhere in this codebase; every
 * discovery route does findMany + in-app shaping (see creator-card.ts),
 * so this matches the established idiom.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const activeStories = await db.story.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      creatorProfileId: true,
      createdAt: true,
      creatorProfile: {
        select: {
          id: true,
          user: { select: { profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const creators: { creatorProfileId: string; displayName: string | null; avatarUrl: string | null; latestStoryAt: Date }[] =
    [];
  for (const s of activeStories) {
    if (seen.has(s.creatorProfileId)) continue; // sorted desc — first occurrence is each creator's most recent story
    seen.add(s.creatorProfileId);
    const avatarUrl = await resolveDisplayUrl(s.creatorProfile.user.profile?.avatarUrl);
    creators.push({
      creatorProfileId: s.creatorProfileId,
      displayName: s.creatorProfile.user.profile?.displayName ?? null,
      avatarUrl: avatarUrl ?? null,
      latestStoryAt: s.createdAt,
    });
    if (creators.length >= RESULT_LIMIT) break;
  }

  return NextResponse.json({ creators });
}
