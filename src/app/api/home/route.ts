import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";
import { computeTrendingContent } from "@/lib/discovery/trending";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const SECTION_LIMIT = 10;

/**
 * Fan Home, composed per build brief §13's stated priority order:
 *   1. Creators the fan follows
 *   2. Subscribed creators
 *   3. Unlimited discovery
 *   4. Recommended creators
 *   5. Trending content
 *   6. New verified creators
 *
 * For a logged-out visitor, sections 1/2/3 are simply empty and the
 * response degrades to trending + new creators — no separate "logged out
 * home" endpoint needed. "Recommended" here is intentionally a simple
 * fallback (verified creators the fan doesn't already follow, most
 * recently approved first) rather than a recommendation model — build
 * brief §31 excludes "Complex recommendation AI" from MVP scope.
 */
export async function GET() {
  const user = await getCurrentUser();

  const [followedContent, subscribedContent, unlimitedCreators, trending, newCreators] = await Promise.all([
    getFollowedCreatorsContent(user?.id),
    getSubscribedCreatorsContent(user?.id),
    getUnlimitedParticipatingCreators(),
    getTrendingSection(),
    getNewCreatorsSection(),
  ]);

  const followedCreatorIds = new Set(followedContent.creatorIds);
  const recommended = await getRecommendedCreators(followedCreatorIds);

  return NextResponse.json({
    following: followedContent.items,
    subscribed: subscribedContent.items,
    unlimited: unlimitedCreators,
    recommended,
    trending,
    newCreators,
  });
}

async function getFollowedCreatorsContent(fanId?: string): Promise<{ items: unknown[]; creatorIds: string[] }> {
  if (!fanId) return { items: [], creatorIds: [] };

  const follows = await db.follow.findMany({ where: { fanId }, select: { creatorProfileId: true } });
  const creatorIds: string[] = follows.map((f: (typeof follows)[number]) => f.creatorProfileId);
  if (creatorIds.length === 0) return { items: [], creatorIds };

  const items = await db.content.findMany({
    where: {
      creatorProfileId: { in: creatorIds },
      status: "APPROVED",
      publishedAt: { not: null },
    },
    orderBy: { publishedAt: "desc" },
    take: SECTION_LIMIT,
    select: { id: true, accessLevel: true, caption: true, publishedAt: true, creatorProfileId: true },
  });

  return { items, creatorIds };
}

async function getSubscribedCreatorsContent(fanId?: string) {
  if (!fanId) return { items: [] as unknown[] };

  const subs = await db.subscription.findMany({
    where: { fanId, status: "ACTIVE", currentPeriodEnd: { gte: new Date() } },
    select: { creatorProfileId: true },
  });
  const creatorIds = subs.map((s: (typeof subs)[number]) => s.creatorProfileId);
  if (creatorIds.length === 0) return { items: [] };

  const items = await db.content.findMany({
    where: { creatorProfileId: { in: creatorIds }, status: "APPROVED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: SECTION_LIMIT,
    select: { id: true, accessLevel: true, caption: true, publishedAt: true, creatorProfileId: true },
  });

  return { items };
}

async function getUnlimitedParticipatingCreators() {
  const creators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED", unlimitedOptedIn: true },
    take: SECTION_LIMIT,
    select: CREATOR_CARD_SELECT,
  });
  return Promise.all(creators.map(toCreatorCard));
}

async function getRecommendedCreators(excludeCreatorIds: Set<string>) {
  const creators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED", id: { notIn: Array.from(excludeCreatorIds) } },
    orderBy: { approvedAt: "desc" },
    take: SECTION_LIMIT,
    select: CREATOR_CARD_SELECT,
  });
  return Promise.all(creators.map(toCreatorCard));
}

async function getTrendingSection() {
  const ranked = (await computeTrendingContent()).slice(0, SECTION_LIMIT);
  if (ranked.length === 0) return [];

  const content = await db.content.findMany({
    where: { id: { in: ranked.map((r) => r.contentId) }, status: "APPROVED", publishedAt: { not: null } },
    select: { id: true, accessLevel: true, caption: true, publishedAt: true, creatorProfileId: true },
  });
  const byId = new Map(content.map((c: (typeof content)[number]) => [c.id, c]));
  return ranked.map((r) => byId.get(r.contentId)).filter(Boolean);
}

async function getNewCreatorsSection() {
  const creators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED" },
    orderBy: { approvedAt: "desc" },
    take: SECTION_LIMIT,
    select: CREATOR_CARD_SELECT,
  });
  return Promise.all(creators.map(toCreatorCard));
}
