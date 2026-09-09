export interface CreatorPricing {
  vvipPriceUsd: number;
}

// Exclusive (VVIP) subscription pricing — creator-settable per explicit
// product decision (reverting an earlier "fixed $9.99 for everyone, not
// creator-settable" rule). EXCLUSIVE_MIN_PRICE_USD is the platform-wide
// floor, enforced both here (defensively, on read) and in the write path
// (PATCH /api/creator/settings's own Zod validation) so a creator can
// never end up below it either by a bad write or by stale/legacy data.
// EXCLUSIVE_DEFAULT_PRICE_USD is what a creator's price effectively is
// until they set their own via CreatorProfile.vvipPriceOverride.
export const EXCLUSIVE_MIN_PRICE_USD = 5;
export const EXCLUSIVE_DEFAULT_PRICE_USD = 9.99;

/**
 * The single place that resolves "what does this fan actually pay for
 * this creator's Exclusive subscription" — profile cards, checkout, and
 * the ledger's `postRevenueEvent` should all derive the price through
 * here rather than reading CreatorProfile.vvipPriceOverride directly.
 * `vvipPriceOverride` stays typed `unknown` at the boundary (it's really
 * `Prisma.Decimal | null`) so every call site — which each already has a
 * plain CreatorProfile row in hand, no dedicated fetch needed — can pass
 * it straight through without importing Prisma's runtime types just for
 * this.
 */
export async function resolveCreatorPricing(creator: {
  vvipPriceOverride: unknown; // Prisma.Decimal | null
}): Promise<CreatorPricing> {
  const raw = creator.vvipPriceOverride;
  let price = EXCLUSIVE_DEFAULT_PRICE_USD;
  if (raw != null) {
    const n = Number(raw);
    if (Number.isFinite(n)) price = n;
  }
  return { vvipPriceUsd: Math.max(price, EXCLUSIVE_MIN_PRICE_USD) };
}
