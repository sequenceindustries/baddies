import type { User } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildViewerLockContext, computeLockState } from "@/lib/entitlements/list-lock";
import { computeTrendingContent } from "@/lib/discovery/trending";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { getBusinessConfig } from "@/lib/config/settings";
import { POST_ITEM_SELECT, buildLockCta, shapeContentItem, type PostItemRow } from "@/lib/feed/post-item";
import type { PostCardItem } from "@/components/post-card";

const PAGE_SIZE = 20;
const SUGGESTED_POOL_SIZE = 12;

export interface FeedPage {
  items: PostCardItem[];
  nextCursor: string | null;
}

/**
 * SEO Phase 4 — extracted verbatim from GET /api/feed/route.ts (which
 * now delegates here for both scopes), so /discovery's server-rendered
 * grid (src/app/discovery/page.tsx) and the paginated API route
 * consuming subsequent pages share one implementation. Behavior is
 * completely unchanged — see the route's own original doc comment
 * (still accurate) for the full `scope` semantics; `viewer` may be
 * null throughout (this was already true before this extraction, the
 * discovery scope just wasn't ever reached that way since the page
 * itself required a session to render at all).
 */
export async function getFeedPage({
  scope,
  cursor,
  viewer,
}: {
  scope: "home" | "discovery";
  cursor?: string;
  viewer: Pick<User, "id" | "role"> | null;
}): Promise<FeedPage> {
  const [viewerCtx, trending, businessConfig, follows] = await Promise.all([
    buildViewerLockContext(viewer),
    computeTrendingContent(),
    getBusinessConfig(),
    viewer
      ? db.follow.findMany({ where: { fanId: viewer.id }, select: { creatorProfileId: true } })
      : Promise.resolve([]),
  ]);

  const trendingIds = new Set(trending.map((t) => t.contentId));
  const followedCreatorIds = new Set(follows.map((f: (typeof follows)[number]) => f.creatorProfileId));

  // Only computed for the home scope — Discovery stays platform-wide,
  // so it never needs a creator-id allowlist at all.
  let allowedCreatorIds: Set<string> | null = null;
  let suggestedCreatorIds = new Set<string>();
  if (scope === "home") {
    const [vipOptedIn, suggested] = await Promise.all([
      viewerCtx.vipPassActive || viewerCtx.trialActive
        ? db.creatorProfile.findMany({ where: { unlimitedOptedIn: true, status: "VERIFIED" }, select: { id: true } })
        : Promise.resolve([]),
      db.creatorProfile.findMany({
        where: { status: "VERIFIED" },
        orderBy: { approvedAt: "desc" },
        take: SUGGESTED_POOL_SIZE,
        select: { id: true },
      }),
    ]);
    suggestedCreatorIds = new Set(suggested.map((c: (typeof suggested)[number]) => c.id));
    allowedCreatorIds = new Set([
      ...followedCreatorIds,
      ...viewerCtx.subscribedCreatorProfileIds,
      ...vipOptedIn.map((c: (typeof vipOptedIn)[number]) => c.id),
      ...suggestedCreatorIds,
    ]);
  }

  const items: (PostItemRow & { likes: { id: string }[] })[] = await db.content.findMany({
    where: {
      status: "APPROVED",
      publishedAt: { not: null },
      creatorProfile: { status: "VERIFIED" },
      ...(allowedCreatorIds ? { creatorProfileId: { in: Array.from(allowedCreatorIds) } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      ...POST_ITEM_SELECT,
      likes: viewer ? { where: { fanId: viewer.id }, select: { id: true } } : false,
    },
  });

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  // Always derived from the raw fetched page, never from anything
  // filtered below — Discovery's locked-item filter must never shift
  // pagination (skipping or repeating items across pages).
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

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

      return await shapeContentItem(item, {
        lock,
        viewerHasLiked: viewer ? item.likes.length > 0 : false,
        viewerIsFollowing: followedCreatorIds.has(item.creatorProfileId),
        viewerIsSubscribed: viewerCtx.subscribedCreatorProfileIds.has(item.creatorProfileId),
        vvipPriceUsd: await vvipPriceFor(item.creatorProfile),
        context: followedCreatorIds.has(item.creatorProfileId)
          ? "following"
          : trendingIds.has(item.id)
            ? "trending"
            : suggestedCreatorIds.has(item.creatorProfileId)
              ? "suggested"
              : null,
      });
    })
  );

  // Discovery only ever shows what a fan can actually open — a locked
  // card here would just be subscribe-bait with nothing to browse.
  const visible = scope === "discovery" ? shaped.filter((i) => !i.lock.locked) : shaped;

  return { items: visible, nextCursor };
}
