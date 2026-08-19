import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { db } from "@/lib/db/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";

/**
 * Matches build brief §11's creator card spec (updated for the Free/VIP/
 * VVIP tier model — see prisma/schema.prisma's ContentAccessLevel
 * comment; VVIP is labeled "Exclusive" in user-facing copy):
 *   Creator Name / ✓ VERIFIED BADDIE / City, Country / Exclusive $9.99
 * Every discovery endpoint (search, trending, categories, new-creators,
 * home) should shape its results through this function instead of
 * hand-rolling the same fields slightly differently each time.
 */
export interface CreatorCardSource {
  id: string;
  locationVisible: boolean;
  vvipPriceOverride: unknown;
  isLive: boolean;
  // The creator's own chosen "featured image" (set via /apply at
  // signup or the Dashboard's Content tab) — reuses the schema's
  // existing coverImageUrl field. Takes priority over the latest-Free-
  // post fallback below when set, since it's a deliberate choice about
  // what represents this creator on discovery cards, not just whatever
  // they happened to post most recently.
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
  isLive: boolean;
  thumbnailUrl: string | null;
  thumbnailMimeType: string | null;
}

export async function toCreatorCard(creator: CreatorCardSource): Promise<CreatorCard> {
  // Skip the latest-Free-post lookup entirely once a featured image is
  // set — it'll never be used, no reason to pay for the query.
  const [pricing, thumbnail] = await Promise.all([
    resolveCreatorPricing(creator),
    creator.coverImageUrl ? Promise.resolve(null) : getLatestFreeThumbnail(creator.id),
  ]);
  return {
    creatorProfileId: creator.id,
    displayName: creator.user.profile?.displayName ?? null,
    avatarUrl: creator.user.profile?.avatarUrl ?? null,
    country: creator.locationVisible ? (creator.user.profile?.country ?? null) : null,
    city: creator.locationVisible ? (creator.user.profile?.city ?? null) : null,
    verifiedBadge: true,
    vvipPriceUsd: pricing.vvipPriceUsd,
    isLive: creator.isLive,
    thumbnailUrl: creator.coverImageUrl ?? thumbnail?.signedUrl ?? null,
    thumbnailMimeType: creator.coverImageUrl ? guessMimeType(creator.coverImageUrl) : (thumbnail?.mimeType ?? null),
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

/**
 * The card's big thumbnail is always this creator's own latest FREE
 * post, never a locked tier — free content is public the moment it's
 * live (see src/lib/entitlements/content.ts), so handing out its signed
 * URL on a discovery card needs no per-viewer entitlement check the way
 * VIP/Exclusive content would. A creator with no Free posts yet just
 * gets no thumbnail (the card falls back to their avatar).
 */
async function getLatestFreeThumbnail(creatorProfileId: string): Promise<{ signedUrl: string; mimeType: string } | null> {
  const content = await db.content.findFirst({
    where: { creatorProfileId, accessLevel: "FREE", status: "APPROVED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { mediaAssets: { take: 1, select: { storageKey: true, mimeType: true } } },
  });
  const asset = content?.mediaAssets[0];
  if (!asset) return null;

  const storage = getMediaStorageProvider();
  const signedUrl = await storage.getSignedReadUrl(asset.storageKey);
  return { signedUrl, mimeType: asset.mimeType };
}

export const CREATOR_CARD_SELECT = {
  id: true,
  locationVisible: true,
  vvipPriceOverride: true,
  isLive: true,
  coverImageUrl: true,
  user: { select: { profile: { select: { displayName: true, avatarUrl: true, country: true, city: true } } } },
} as const;
