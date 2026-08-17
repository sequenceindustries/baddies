import { getBusinessConfig } from "@/lib/config/settings";

export interface CreatorPricing {
  entryPriceUsd: number;
  vipPriceUsd: number;
}

/**
 * Per build brief §32, pricing must be configurable, not hard-coded. The
 * platform-wide default lives in `platform_settings`; an individual
 * creator's override (CreatorProfile.entryPriceOverride/vipPriceOverride)
 * takes precedence when set. This is the single place that resolves
 * "what does this fan actually pay" — profile cards, checkout, and the
 * ledger's `postRevenueEvent` should all derive the price through here
 * rather than reading `entryPriceOverride` directly.
 */
export async function resolveCreatorPricing(creator: {
  entryPriceOverride: unknown; // Prisma.Decimal | null — kept loose to avoid importing generated types here
  vipPriceOverride: unknown;
}): Promise<CreatorPricing> {
  const config = await getBusinessConfig();
  return {
    entryPriceUsd: creator.entryPriceOverride != null ? Number(creator.entryPriceOverride) : config.entryPriceUsd,
    vipPriceUsd: creator.vipPriceOverride != null ? Number(creator.vipPriceOverride) : config.vipPriceUsd,
  };
}
