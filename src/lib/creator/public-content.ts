import type { User } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildViewerLockContext, computeLockState } from "@/lib/entitlements/list-lock";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { getBusinessConfig } from "@/lib/config/settings";
import { POST_ITEM_SELECT, buildLockCta, shapeContentItem } from "@/lib/feed/post-item";
import type { PostCardItem } from "@/components/post-card";

const PAGE_SIZE = 20;

export interface CreatorPublicContentPage {
  items: PostCardItem[];
  nextCursor: string | null;
}

/**
 * SEO Phase 4 — extracted verbatim from GET /api/creators/
 * [creatorProfileId]/content/route.ts (which now delegates here), so
 * the server-rendered profile page (src/app/creators/
 * [creatorProfileId]/page.tsx) and the paginated API route consuming
 * subsequent pages share one implementation. Behavior is unchanged:
 * `viewer` may be null (an anonymous visitor or crawler) throughout —
 * this route was already safe to call without a session before this
 * extraction, it just wasn't ever reached for one, since the page
 * itself refused to render for a signed-out visitor. Never returns a
 * media URL (that's exclusively GET /api/content/:id/media's job,
 * gated separately by canAccessContent) — `lock` is the same
 * display-only mirror every other list route uses, never authoritative.
 */
export async function getCreatorPublicContentPage({
  creatorProfileId,
  cursor,
  viewer,
}: {
  creatorProfileId: string;
  cursor?: string;
  viewer: Pick<User, "id" | "role"> | null;
}): Promise<CreatorPublicContentPage | null> {
  const creator = await db.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { status: true, ...POST_ITEM_SELECT.creatorProfile.select },
  });
  if (!creator || creator.status !== "VERIFIED") {
    return null;
  }

  const items = await db.content.findMany({
    where: { creatorProfileId, status: "APPROVED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      mediaType: true,
      accessLevel: true,
      caption: true,
      publishedAt: true,
      status: true,
      creatorProfileId: true,
      _count: { select: { likes: true } },
      likes: viewer ? { where: { fanId: viewer.id }, select: { id: true } } : false,
    },
  });

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;

  const [viewerCtx, businessConfig, { vvipPriceUsd }, isFollowing] = await Promise.all([
    buildViewerLockContext(viewer),
    getBusinessConfig(),
    resolveCreatorPricing(creator),
    viewer
      ? db.follow
          .findUnique({
            where: { fanId_creatorProfileId: { fanId: viewer.id, creatorProfileId } },
            select: { fanId: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
  ]);

  const shaped = await Promise.all(
    page.map(async (item) => {
      const lockState = computeLockState(
        {
          creatorProfileId: item.creatorProfileId,
          accessLevel: item.accessLevel,
          status: item.status,
          publishedAt: item.publishedAt,
          creatorUnlimitedOptedIn: creator.unlimitedOptedIn,
        },
        viewerCtx
      );

      const lock = lockState.locked
        ? buildLockCta(lockState.kind, businessConfig.vipPassPriceUsd, vvipPriceUsd)
        : { locked: false as const, kind: null, priceUsd: null, ctaLabel: null };

      return shapeContentItem(
        { ...item, creatorProfile: creator },
        {
          lock,
          viewerHasLiked: viewer ? item.likes.length > 0 : false,
          viewerIsFollowing: isFollowing,
          viewerIsSubscribed: viewerCtx.subscribedCreatorProfileIds.has(creatorProfileId),
          vvipPriceUsd,
          context: null,
        }
      );
    })
  );

  return {
    items: shaped,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
