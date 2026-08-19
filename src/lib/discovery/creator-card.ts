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
  const [pricing, thumbnail] = await Promise.all([resolveCreatorPricing(creator), getLatestFreeThumbnail(creator.id)]);
  return {
    creatorProfileId: creator.id,
    displayName: creator.user.profile?.displayName ?? null,
    avatarUrl: creator.user.profile?.avatarUrl ?? null,
    country: creator.locationVisible ? (creator.user.profile?.country ?? null) : null,
    city: creator.locationVisible ? (creator.user.profile?.city ?? null) : null,
    verifiedBadge: true,
    vvipPriceUsd: pricing.vvipPriceUsd,
    isLive: creator.isLive,
    thumbnailUrl: thumbnail?.signedUrl ?? null,
    thumbnailMimeType: thumbnail?.mimeType ?? null,
  };
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
  user: { select: { profile: { select: { displayName: true, avatarUrl: true, country: true, city: true } } } },
} as const;
