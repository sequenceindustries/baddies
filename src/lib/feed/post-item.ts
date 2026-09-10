import type { LockKind } from "@/lib/entitlements/list-lock";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

/**
 * Shared shape/select for a single feed-style post item — extracted out
 * of GET /api/feed (the social-feed redesign's original home-feed route)
 * so GET /api/content/:id (Phase 2, powers a grid tap's detail overlay)
 * returns the exact same item shape without duplicating the Prisma
 * select or the lock-CTA copy logic. Behavior here is unchanged from
 * what /api/feed already shipped with — this is a pure extraction, not
 * a rewrite.
 */
export const POST_ITEM_SELECT = {
  id: true,
  mediaType: true,
  accessLevel: true,
  caption: true,
  publishedAt: true,
  status: true,
  creatorProfileId: true,
  _count: { select: { likes: true } },
  creatorProfile: {
    select: {
      id: true,
      unlimitedOptedIn: true,
      vvipPriceOverride: true,
      isFoundingBaddie: true,
      coverImageUrl: true,
      handle: true,
      user: {
        select: {
          profile: { select: { displayName: true, avatarUrl: true } },
          foundingPartner: { select: { id: true } },
        },
      },
    },
  },
} as const;

export interface PostItemRow {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | null;
  accessLevel: "FREE" | "VIP" | "VVIP" | "PPV";
  caption: string | null;
  publishedAt: Date | string | null;
  status: string;
  creatorProfileId: string;
  _count: { likes: number };
  creatorProfile: {
    id: string;
    unlimitedOptedIn: boolean;
    vvipPriceOverride: unknown; // Prisma.Decimal | null — see resolveCreatorPricing's own param type
    isFoundingBaddie: boolean;
    coverImageUrl: string | null;
    handle: string | null;
    user: {
      profile: { displayName: string | null; avatarUrl: string | null } | null;
      foundingPartner: { id: string } | null;
    };
  };
}

export function buildLockCta(
  kind: LockKind,
  vipPassPriceUsd: number,
  vvipPriceUsd: number
): { locked: true; kind: LockKind; priceUsd: number | null; ctaLabel: string } {
  if (kind === "VVIP_SUBSCRIBE") {
    return { locked: true, kind, priceUsd: vvipPriceUsd, ctaLabel: `Subscribe to unlock — $${vvipPriceUsd.toFixed(2)}/mo` };
  }
  if (kind === "VIP_PASS") {
    return { locked: true, kind, priceUsd: vipPassPriceUsd, ctaLabel: `Get VIP Pass — $${vipPassPriceUsd.toFixed(2)}` };
  }
  return { locked: true, kind: null, priceUsd: null, ctaLabel: "Locked" };
}

export async function shapeContentItem(
  item: PostItemRow,
  opts: {
    lock: { locked: boolean; kind: LockKind; priceUsd: number | null; ctaLabel: string | null };
    viewerHasLiked: boolean;
    viewerIsFollowing: boolean;
    // Whether the viewer already has an active Exclusive (VVIP)
    // subscription to THIS item's creator — independent of `lock`,
    // which only describes this one post. Powers the post's own "•••"
    // options-menu Subscribe entry (post-card.tsx), which needs to
    // offer/hide Subscribe regardless of whether this particular post
    // happens to be locked.
    viewerIsSubscribed: boolean;
    // This creator's real Exclusive price — same resolveCreatorPricing
    // value `lock.priceUsd` already uses when a post is VVIP-locked,
    // but surfaced unconditionally here so the options-menu Subscribe
    // entry can show a real price on an unlocked (FREE/VIP) post too.
    vvipPriceUsd: number;
    context: "following" | "trending" | "suggested" | null;
  }
) {
  // Re-derive fresh signed URLs just-in-time — see resolveDisplayUrl's
  // own comment (persist-public-image.ts) for why a stored value can't
  // just be returned verbatim under a SigV4-backed provider (R2/S3).
  const [avatarUrl, coverImageUrl] = await Promise.all([
    resolveDisplayUrl(item.creatorProfile.user.profile?.avatarUrl),
    resolveDisplayUrl(item.creatorProfile.coverImageUrl),
  ]);
  return {
    contentId: item.id,
    mediaType: item.mediaType,
    accessLevel: item.accessLevel,
    caption: item.caption,
    publishedAt: item.publishedAt,
    likeCount: item._count.likes,
    viewerHasLiked: opts.viewerHasLiked,
    creator: {
      creatorProfileId: item.creatorProfile.id,
      displayName: item.creatorProfile.user.profile?.displayName ?? null,
      handle: item.creatorProfile.handle,
      avatarUrl: avatarUrl ?? null,
      coverImageUrl: coverImageUrl ?? null,
      isFoundingPartner: item.creatorProfile.user.foundingPartner !== null,
      isFoundingBaddie: item.creatorProfile.isFoundingBaddie,
      viewerIsFollowing: opts.viewerIsFollowing,
      viewerIsSubscribed: opts.viewerIsSubscribed,
      vvipPriceUsd: opts.vvipPriceUsd,
    },
    lock: opts.lock,
    context: opts.context,
  };
}
