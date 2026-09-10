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
const SUGGESTED_POOL_SIZE = 12;

/**
 * The single source of data for two different consumers, distinguished
 * by a `scope` query param:
 *
 *   - `?scope=discovery` (src/app/discovery/page.tsx's Instagram-style
 *     grid): broad, platform-wide — every VERIFIED creator's content,
 *     same as this route's original behavior — but with locked items
 *     filtered out entirely (Discovery is meant to be a browse-what-
 *     you-can-actually-open surface, not a subscribe-bait wall).
 *   - anything else, i.e. no param (src/app/feed/page.tsx's
 *     Twitter/X-style feed): narrowed to creators this viewer actually
 *     has a relationship with — followed, actively subscribed to (incl.
 *     VIP-pass/trial-covered), or "suggested" (see below) — rendered
 *     LOCKED rather than hidden when the viewer can see it's listed but
 *     hasn't unlocked it, exactly as before. This is a real behavior
 *     change from the previous "every VERIFIED creator" home feed.
 *
 * "Suggested" is a deliberately small, honest heuristic — there is no
 * recommendation engine anywhere in this codebase (build brief §31
 * explicitly excludes one from MVP scope) — it's just the most-
 * recently-approved VERIFIED creators (same query shape as
 * GET /api/discovery/new-creators), always included regardless of
 * sign-in state so a brand-new fan with zero follows/subscriptions
 * still sees something on day one instead of a blank feed.
 *
 * Every item still carries a `lock` object (see list-lock.ts —
 * display-only, never authoritative) and a `context` chip explaining
 * why it's in the stream (`following` > `trending` > `suggested` >
 * none) — this route never returns a signed media URL either way.
 */
export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const scope = req.nextUrl.searchParams.get("scope") === "discovery" ? "discovery" : "home";
  const user = await getCurrentUser();

  const [viewerCtx, trending, businessConfig, follows] = await Promise.all([
    buildViewerLockContext(user),
    computeTrendingContent(),
    getBusinessConfig(),
    user ? db.follow.findMany({ where: { fanId: user.id }, select: { creatorProfileId: true } }) : Promise.resolve([]),
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
      likes: user ? { where: { fanId: user.id }, select: { id: true } } : false,
    },
  });

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  // Always derived from the raw fetched page, never from anything
  // filtered below — Discovery's locked-item filter must never shift
  // pagination (skipping or repeating items across pages).
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

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

      return await shapeContentItem(item, {
        lock,
        viewerHasLiked: user ? item.likes.length > 0 : false,
        viewerIsFollowing: followedCreatorIds.has(item.creatorProfileId),
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

  return NextResponse.json({ items: visible, nextCursor });
}
