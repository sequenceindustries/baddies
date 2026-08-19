import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";
import { getFanCountry, getNearbyCreators } from "@/lib/discovery/nearby";
import { computeTrendingContent } from "@/lib/discovery/trending";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const SECTION_LIMIT = 10;

/**
 * Every content section on Home mixes posts from potentially many
 * different creators, unlike the single-creator timeline (see
 * ContentTimeline), so each item needs to carry its own creator identity
 * — name and avatar, both already public — for ContentCard to render a
 * clickable byline instead of an anonymous post.
 */
const CONTENT_WITH_CREATOR_SELECT = {
  id: true,
  accessLevel: true,
  caption: true,
  publishedAt: true,
  creatorProfileId: true,
  creatorProfile: {
    select: { user: { select: { profile: { select: { displayName: true, avatarUrl: true } } } } },
  },
} as const;

type ContentWithCreator = Prisma.ContentGetPayload<{ select: typeof CONTENT_WITH_CREATOR_SELECT }>;

function shapeContentItem(item: ContentWithCreator) {
  return {
    contentId: item.id,
    accessLevel: item.accessLevel,
    caption: item.caption,
    publishedAt: item.publishedAt,
    creatorProfileId: item.creatorProfileId,
    creatorDisplayName: item.creatorProfile.user.profile?.displayName ?? null,
    creatorAvatarUrl: item.creatorProfile.user.profile?.avatarUrl ?? null,
  };
}

/**
 * Fan Home, composed per build brief §13's stated priority order:
 *   1. Creators the fan follows
 *   2. Your Exclusive (this fan's own active subscriptions — VVIP-tier
 *      content only; Free/VIP content from the same creators belongs in
 *      Following/VIP Content, not mixed into what's actually gated by
 *      the subscription)
 *   3. VIP Content (VIP-tier posts from creators opted into the
 *      platform-wide VIP pass — shown to every fan the same way Trending
 *      is: the card itself resolves to a real unlock or a paywall CTA
 *      depending on whether this fan actually holds the pass)
 *   4. Nearby creators (same country as the fan's own, real, detected
 *      location — see LocationField/useLocationDetector)
 *   5. Trending content
 *   6. New verified creators
 *
 * For a logged-out visitor, sections 1/2 are simply empty and the
 * response degrades to VIP Content/Trending/New — no separate "logged
 * out home" endpoint needed.
 */
export async function GET() {
  const user = await getCurrentUser();

  const [followedContent, subscribedContent, vipContent, unlimitedCreators, trending, newCreators, fanCountry] =
    await Promise.all([
      getFollowedCreatorsContent(user?.id),
      getSubscribedCreatorsContent(user?.id),
      getVipContentSection(),
      getUnlimitedParticipatingCreators(),
      getTrendingSection(),
      getNewCreatorsSection(),
      getFanCountry(user?.id),
    ]);

  const followedCreatorIds = new Set(followedContent.creatorIds);
  const nearby = await getNearbyCreators(fanCountry, followedCreatorIds);

  return NextResponse.json({
    following: followedContent.items,
    subscribed: subscribedContent.items,
    vipContent,
    unlimited: unlimitedCreators,
    nearby,
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
    select: CONTENT_WITH_CREATOR_SELECT,
  });

  return { items: items.map(shapeContentItem), creatorIds };
}

/**
 * "Your Exclusive" — VVIP-tier content only. This is specifically the
 * content this fan's subscription actually gates; a creator's Free/VIP
 * posts show up in Following/VIP Content instead, since mixing them in
 * here made it look like the subscription bought less than it does (or
 * that Free content needed one at all).
 */
async function getSubscribedCreatorsContent(fanId?: string) {
  if (!fanId) return { items: [] as unknown[] };

  const subs = await db.subscription.findMany({
    where: { fanId, status: "ACTIVE", currentPeriodEnd: { gte: new Date() } },
    select: { creatorProfileId: true },
  });
  const creatorIds = subs.map((s: (typeof subs)[number]) => s.creatorProfileId);
  if (creatorIds.length === 0) return { items: [] };

  const items = await db.content.findMany({
    where: {
      creatorProfileId: { in: creatorIds },
      accessLevel: "VVIP",
      status: "APPROVED",
      publishedAt: { not: null },
    },
    orderBy: { publishedAt: "desc" },
    take: SECTION_LIMIT,
    select: CONTENT_WITH_CREATOR_SELECT,
  });

  return { items: items.map(shapeContentItem) };
}

async function getUnlimitedParticipatingCreators() {
  const creators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED", unlimitedOptedIn: true },
    take: SECTION_LIMIT,
    select: CREATOR_CARD_SELECT,
  });
  return Promise.all(creators.map(toCreatorCard));
}

/**
 * "VIP Content" — actual VIP-tier posts from creators opted into the
 * platform-wide VIP pass, not just a list of participating creators
 * (that's what "Included with VIP Pass" already is). Shown to every fan
 * the same way Trending is: ContentCard resolves each one to a real
 * unlock or a "Get VIP Pass" CTA depending on whether this fan actually
 * holds the pass — no need to gate the section itself on that.
 */
async function getVipContentSection() {
  const items = await db.content.findMany({
    where: {
      accessLevel: "VIP",
      status: "APPROVED",
      publishedAt: { not: null },
      creatorProfile: { unlimitedOptedIn: true },
    },
    orderBy: { publishedAt: "desc" },
    take: SECTION_LIMIT,
    select: CONTENT_WITH_CREATOR_SELECT,
  });
  return items.map(shapeContentItem);
}

async function getTrendingSection() {
  const ranked = (await computeTrendingContent()).slice(0, SECTION_LIMIT);
  if (ranked.length === 0) return [];

  const content = await db.content.findMany({
    where: { id: { in: ranked.map((r) => r.contentId) }, status: "APPROVED", publishedAt: { not: null } },
    select: CONTENT_WITH_CREATOR_SELECT,
  });
  const byId = new Map(content.map((c: (typeof content)[number]) => [c.id, c]));
  return ranked.map((r) => byId.get(r.contentId)).filter((c): c is ContentWithCreator => Boolean(c)).map(shapeContentItem);
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
