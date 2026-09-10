import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildViewerLockContext, computeLockState } from "@/lib/entitlements/list-lock";
import { computeTrendingContent } from "@/lib/discovery/trending";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { getBusinessConfig } from "@/lib/config/settings";
import { POST_ITEM_SELECT, buildLockCta, shapeContentItem } from "@/lib/feed/post-item";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Single-post metadata — the same shape a GET /api/feed item has (lock
 * object, engagement counts, creator byline), never a signed media URL
 * (that's still exclusively GET /api/content/:id/media's job). Powers
 * the Discovery/profile grid's "open one post" detail overlay (Phase 2
 * of the social-feed redesign) without paying for a whole feed page's
 * cursor query just to render one card.
 *
 * Visibility mirrors GET /api/feed's own where-clause exactly (live,
 * published, VERIFIED creator) — a grid tap can only ever reach a post
 * that was already listed by that same route, but this route
 * independently re-checks rather than trusting the caller.
 */
export async function GET(req: NextRequest, { params }: { params: { contentId: string } }) {
  const user = await getCurrentUser();

  const item = await db.content.findFirst({
    where: {
      id: params.contentId,
      status: "APPROVED",
      publishedAt: { not: null },
      creatorProfile: { status: "VERIFIED" },
    },
    select: {
      ...POST_ITEM_SELECT,
      likes: user ? { where: { fanId: user.id }, select: { id: true } } : false,
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  const [viewerCtx, trending, businessConfig, isFollowing] = await Promise.all([
    buildViewerLockContext(user),
    computeTrendingContent(),
    getBusinessConfig(),
    user
      ? db.follow
          .findUnique({
            where: { fanId_creatorProfileId: { fanId: user.id, creatorProfileId: item.creatorProfileId } },
            select: { fanId: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
  ]);

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

  const { vvipPriceUsd } = await resolveCreatorPricing(item.creatorProfile);

  const lock = lockState.locked
    ? buildLockCta(lockState.kind, businessConfig.vipPassPriceUsd, lockState.kind === "VVIP_SUBSCRIBE" ? vvipPriceUsd : 0)
    : { locked: false as const, kind: null, priceUsd: null, ctaLabel: null };

  const shaped = await shapeContentItem(item, {
    lock,
    viewerHasLiked: user ? item.likes.length > 0 : false,
    viewerIsFollowing: isFollowing,
    viewerIsSubscribed: viewerCtx.subscribedCreatorProfileIds.has(item.creatorProfileId),
    vvipPriceUsd,
    context: isFollowing ? "following" : trending.some((t) => t.contentId === item.id) ? "trending" : null,
  });

  return NextResponse.json(shaped);
}
