import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

/**
 * Matches build brief §11's creator card spec (updated for the Free/VIP/
 * VVIP tier model — see prisma/schema.prisma's ContentAccessLevel
 * comment; VVIP is labeled "Exclusive" in user-facing copy):
 *   Creator Name / ✓ VERIFIED BADDIE / City, Country / Exclusive $10
 * Every discovery endpoint (search, trending, categories, new-creators,
 * home) should shape its results through this function instead of
 * hand-rolling the same fields slightly differently each time.
 */
export interface CreatorCardSource {
  id: string;
  locationVisible: boolean;
  vvipPriceOverride: unknown;
  // The creator's own chosen "featured image" (set via /apply at
  // signup or the Dashboard's Content tab) — reuses the schema's
  // existing coverImageUrl field. The only image a card shows besides the
  // avatar — a deliberate choice about
  // what represents this creator on discovery cards.
  coverImageUrl: string | null;
  user: {
    profile: { displayName: string | null; avatarUrl: string | null; country: string | null; city: string | null } | null;
  };
}

export interface CreatorCard {
  creatorProfileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  city: string | null;
  verifiedBadge: true;
  vvipPriceUsd: number;
  thumbnailUrl: string | null;
  thumbnailMimeType: string | null;
}

export async function toCreatorCard(creator: CreatorCardSource): Promise<CreatorCard> {
  // Profile previews only: the creator's own feature image and profile
  // picture, never a post. Cards are shown to signed-out visitors (and
  // the list routes are publicly cached, identical for every viewer), so
  // falling back to the latest teaser post would leak content before
  // sign-in. No feature image → the card falls back to the avatar.
  const [pricing, avatarUrl, coverImageUrl] = await Promise.all([
    resolveCreatorPricing(creator),
    resolveDisplayUrl(creator.user.profile?.avatarUrl),
    resolveDisplayUrl(creator.coverImageUrl),
  ]);
  return {
    creatorProfileId: creator.id,
    displayName: creator.user.profile?.displayName ?? null,
    avatarUrl: avatarUrl ?? null,
    country: creator.locationVisible ? (creator.user.profile?.country ?? null) : null,
    city: creator.locationVisible ? (creator.user.profile?.city ?? null) : null,
    verifiedBadge: true,
    vvipPriceUsd: pricing.vvipPriceUsd,
    thumbnailUrl: coverImageUrl ?? null,
    thumbnailMimeType: creator.coverImageUrl ? guessMimeType(creator.coverImageUrl) : null,
  };
}

// The featured image is either a data: URI (uploaded via the file
// picker — see AvatarField's pattern in settings/page.tsx, reused for
// this) or, in principle, a real hosted URL; either way CreatorCard only
// needs to know image vs. video to pick the right <img>/<video> tag, so
// a data: URI's declared mime type is enough and anything else safely
// defaults to a plain image.
function guessMimeType(url: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(url);
  return match?.[1] ?? "image/jpeg";
}

export const CREATOR_CARD_SELECT = {
  id: true,
  locationVisible: true,
  vvipPriceOverride: true,
  coverImageUrl: true,
  user: {
    select: {
      profile: { select: { displayName: true, avatarUrl: true, country: true, city: true } },
    },
  },
} as const;
