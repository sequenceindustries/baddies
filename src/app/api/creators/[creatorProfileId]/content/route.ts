import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildViewerLockContext, computeLockState } from "@/lib/entitlements/list-lock";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { getBusinessConfig } from "@/lib/config/settings";
import { POST_ITEM_SELECT, buildLockCta, shapeContentItem } from "@/lib/feed/post-item";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * A creator's own feed — now returning the exact same post-item shape
 * GET /api/feed and GET /api/content/:id already do (lock object,
 * engagement counts, creator byline), so the profile page's Instagram-
 * style grid (social-feed redesign, Phase 3) can feed GridThumbnail/
 * PostDetailOverlay directly without a translation layer. This is a
 * full reshape rather than an additive bolt-on: the previous ad-hoc
 * {priceUsd, ...} shape had exactly one consumer (this creator's own
 * profile page), which is being rewritten in the same change, so
 * keeping two parallel shapes alive would only add duplication with no
 * real compatibility to protect.
 *
 * Still never returns a media URL — that's exclusively
 * /api/content/:id/media's job, gated by canAccessContent. `lock` here
 * is the same display-only mirror (list-lock.ts) every other list
 * route already uses; never authoritative.
 */
export async function GET(req: NextRequest, { params }: { params: { creatorProfileId: string } }) {
  const creator = await db.creatorProfile.findUnique({
    where: { id: params.creatorProfileId },
    select: { status: true, ...POST_ITEM_SELECT.creatorProfile.select },
  });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const viewer = await getCurrentUser();

  const items = await db.content.findMany({
    where: { creatorProfileId: creator.id, status: "APPROVED", publishedAt: { not: null } },
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
            where: { fanId_creatorProfileId: { fanId: viewer.id, creatorProfileId: params.creatorProfileId } },
            select: { fanId: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
  ]);

  const shaped = page.map((item) => {
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
      { lock, viewerHasLiked: viewer ? item.likes.length > 0 : false, viewerIsFollowing: isFollowing, context: null }
    );
  });

  return NextResponse.json({
    items: shaped,
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
