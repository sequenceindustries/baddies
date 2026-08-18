import { getBusinessConfig } from "@/lib/config/settings";

export interface CreatorPricing {
  vvipPriceUsd: number;
}

/**
 * Per build brief §32, pricing must be configurable, not hard-coded. The
 * platform-wide default lives in `platform_settings`; an individual
 * creator's override (CreatorProfile.vvipPriceOverride) takes precedence
 * when set. This is the single place that resolves "what does this fan
 * actually pay for this creator's subscription" — profile cards,
 * checkout, and the ledger's `postRevenueEvent` should all derive the
 * price through here rather than reading `vvipPriceOverride` directly.
 *
 * The platform-wide VIP pass price (config.vipPassPriceUsd) is NOT
 * creator-specific — read it directly from getBusinessConfig() instead.
 */
export async function resolveCreatorPricing(creator: {
  vvipPriceOverride: unknown; // Prisma.Decimal | null — kept loose to avoid importing generated types here
}): Promise<CreatorPricing> {
  const config = await getBusinessConfig();
  return {
    vvipPriceUsd: creator.vvipPriceOverride != null ? Number(creator.vvipPriceOverride) : config.vvipDefaultPriceUsd,
  };
}
