import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildViewerLockContext, computeLockState } from "@/lib/entitlements/list-lock";
import { computeTrendingContent } from "@/lib/discovery/trending";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { getBusinessConfig } from "@/lib/config/settings";
import { POST_ITEM_SELECT, buildLockCta, shapeContentItem, type PostItemRow } from "@/lib/feed/post-item";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * The home feed's single source of data — the social-feed redesign's
 * Twitter/X-style vertical scroll (fan-home) and Instagram-style
 * Discovery grid both consume this one cursor-paginated, reverse-
 * chronological stream (Discovery adds nothing of its own beyond
 * lazy-loading media per thumbnail — see GET /api/content/:id for the
 * single-item shape a grid tap's detail overlay uses instead).
 * Previously an unused Sprint-2 stub restricted to FREE/VIP content
 * from VERIFIED creators only; revived and extended:
 *
 *   - VVIP content is now included too, rendered LOCKED rather than
 *     hidden — a deliberate widening of what's LISTED (see the
 *     redesign plan's own callout: this never widens what's
 *     UNLOCKABLE, only what appears, always still gated correctly).
 *   - Every item now carries a `lock` object (see list-lock.ts — a
 *     display-only mirror of canAccessContent, never authoritative)
 *     and a `context` chip (why this is in the stream) so a locked
 *     card can render a real "Subscribe to unlock" / "Get VIP Pass"
 *     CTA instead of nothing.
 *   - Real, per-post engagement counts (likes, tips) rather than
 *     nothing — the actual unlock/like/tip actions still go through
 *     their own existing/new dedicated routes; this route never
 *     returns a signed media URL.
 *
 * The six flat, non-paginated sections GET /api/home used to compose
 * (Following/Your Exclusive/VIP Content/Nearby/Trending/New) are fully
 * superseded by this one blended, infinite-scrollable stream — no
 * section headers, matching what "Twitter/X-style" actually means (X's
 * own timeline has none). The small `context` chip preserves "why is
 * this here" transparency without a multi-cursor-merge problem this
 * codebase has never needed to solve.
 */
export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const user = await getCurrentUser();

  const items: (PostItemRow & { likes: { id: string }[] })[] = await db.content.findMany({
    where: {
      status: "APPROVED",
      publishedAt: { not: null },
      creatorProfile: { status: "VERIFIED" },
    },
    orderBy: { publishedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      ...POST_ITEM_SELECT,
      likes: user ? { where: { fanId: user.id }, select: { id: true } } : false,
    },
  });

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;

  const [viewerCtx, trending, businessConfig, follows] = await Promise.all([
    buildViewerLockContext(user),
    computeTrendingContent(),
    getBusinessConfig(),
    user ? db.follow.findMany({ where: { fanId: user.id }, select: { creatorProfileId: true } }) : Promise.resolve([]),
  ]);

  const trendingIds = new Set(trending.map((t) => t.contentId));
  const followedCreatorIds = new Set(follows.map((f: (typeof follows)[number]) => f.creatorProfileId));

  // resolveCreatorPricing is pure/no-DB (reads the field we already
  // selected) — cached per creator on this page purely to avoid
  // re-computing the same number for every one of a prolific creator's
  // several posts on one page, not to avoid a query.
  const vvipPriceByCreatorId = new Map<string, number>();
  async function vvipPriceFor(creator: PostItemRow["creatorProfile"]): Promise<number> {
    const cached = vvipPriceByCreatorId.get(creator.id);
    if (cached != null) return cached;
    const { vvipPriceUsd } = await resolveCreatorPricing(creator);
    vvipPriceByCreatorId.set(creator.id, vvipPriceUsd);
    return vvipPriceUsd;
  }

  const shaped = await Promise.all(
    page.map(async (item) => {
      const lockState = computeLockState(
        {
          creatorProfileId: item.creatorProfileId,
          accessLevel: item.accessLevel,
          status: item.status,
          publishedAt: item.publishedAt,
          creatorUnlimitedOptedIn: item.creatorProfile.unlimitedOptedIn,
        },
        viewerCtx
      );

      const lock = lockState.locked
        ? buildLockCta(
            lockState.kind,
            businessConfig.vipPassPriceUsd,
            lockState.kind === "VVIP_SUBSCRIBE" ? await vvipPriceFor(item.creatorProfile) : 0
          )
        : { locked: false as const, kind: null, priceUsd: null, ctaLabel: null };

      return shapeContentItem(item, {
        lock,
        viewerHasLiked: user ? item.likes.length > 0 : false,
        context: followedCreatorIds.has(item.creatorProfileId)
          ? "following"
          : trendingIds.has(item.id)
            ? "trending"
            : null,
      });
    })
  );

  return NextResponse.json({
    items: shaped,
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
