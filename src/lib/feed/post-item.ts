import type { LockKind } from "@/lib/entitlements/list-lock";

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

export function shapeContentItem(
  item: PostItemRow,
  opts: {
    lock: { locked: boolean; kind: LockKind; priceUsd: number | null; ctaLabel: string | null };
    viewerHasLiked: boolean;
    context: "following" | "trending" | "suggested" | null;
  }
) {
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
      avatarUrl: item.creatorProfile.user.profile?.avatarUrl ?? null,
      coverImageUrl: item.creatorProfile.coverImageUrl,
      isFoundingPartner: item.creatorProfile.user.foundingPartner !== null,
      isFoundingBaddie: item.creatorProfile.isFoundingBaddie,
    },
    lock: opts.lock,
    context: opts.context,
  };
}
