export interface CreatorPricing {
  vvipPriceUsd: number;
}

// Exclusive (VVIP) subscription price — fixed at $9.99/mo for every
// creator, full stop. Per explicit product decision this is NOT
// configurable by the creator (CreatorProfile.vvipPriceOverride is
// deliberately unread below, though the column stays in the schema —
// no historical LedgerEntry needs it renamed) and not read from
// PlatformSetting either — this one price is a hardcoded business rule,
// not a runtime setting. This deliberately overrides the earlier "pricing
// must be configurable" build-brief rule (§32) for this one price only;
// the platform-wide VIP Pass price and the creator/platform revenue
// split remain configurable via PlatformSetting exactly as before (see
// getBusinessConfig in src/lib/config/settings.ts).
export const EXCLUSIVE_PRICE_USD = 9.99;

/**
 * The single place that resolves "what does this fan actually pay for
 * this creator's Exclusive subscription" — profile cards, checkout, and
 * the ledger's `postRevenueEvent` should all derive the price through
 * here rather than reading CreatorProfile.vvipPriceOverride directly.
 * Takes a `creator` argument for call-site compatibility (every caller
 * already has the row in hand) even though it's unused now — keeps this
 * a drop-in resolver if per-creator pricing is ever reintroduced.
 */
export async function resolveCreatorPricing(_creator: {
  vvipPriceOverride: unknown; // Prisma.Decimal | null — deliberately unread, see EXCLUSIVE_PRICE_USD above
}): Promise<CreatorPricing> {
  return { vvipPriceUsd: EXCLUSIVE_PRICE_USD };
}
