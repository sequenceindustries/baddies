import { resolveCreatorPricing } from "@/lib/creator/pricing";

/**
 * Matches build brief §11's creator card spec (updated for the Free/VIP/
 * VVIP tier model — see prisma/schema.prisma's ContentAccessLevel
 * comment):
 *   Creator Name / ✓ VERIFIED BADDIE / 🇿🇦 South Africa / VVIP $9.99
 * Every discovery endpoint (search, trending, categories, new-creators,
 * home) should shape its results through this function instead of
 * hand-rolling the same fields slightly differently each time.
 */
export interface CreatorCardSource {
  id: string;
  locationVisible: boolean;
  vvipPriceOverride: unknown;
  user: { profile: { displayName: string | null; avatarUrl: string | null; country: string | null } | null };
}

export interface CreatorCard {
  creatorProfileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  verifiedBadge: true;
  vvipPriceUsd: number;
}

export async function toCreatorCard(creator: CreatorCardSource): Promise<CreatorCard> {
  const pricing = await resolveCreatorPricing(creator);
  return {
    creatorProfileId: creator.id,
    displayName: creator.user.profile?.displayName ?? null,
    avatarUrl: creator.user.profile?.avatarUrl ?? null,
    country: creator.locationVisible ? (creator.user.profile?.country ?? null) : null,
    verifiedBadge: true,
    vvipPriceUsd: pricing.vvipPriceUsd,
  };
}

export const CREATOR_CARD_SELECT = {
  id: true,
  locationVisible: true,
  vvipPriceOverride: true,
  user: { select: { profile: { select: { displayName: true, avatarUrl: true, country: true } } } },
} as const;
