import { db } from "@/lib/db/client";
import { getBundleDiscountCurve, getRecommendedDurationMonths, getBusinessConfig } from "@/lib/config/settings";

export interface CreatorPricing {
  vvipPriceUsd: number;
}

// Monetisation redesign — the supported prepaid package durations.
// Configurable pricing per duration, but the SET of durations itself is
// fixed to these 4, matching the spec exactly.
export const SUBSCRIPTION_DURATIONS_MONTHS = [1, 3, 6, 12] as const;
export type SubscriptionDurationMonths = (typeof SUBSCRIPTION_DURATIONS_MONTHS)[number];

export interface DurationPackage {
  durationMonths: number;
  priceUsd: number;
  // What this package would cost at the 1-month rate x durationMonths,
  // for "you save $X" UI copy — never itself charged.
  undiscountedPriceUsd: number;
  discountPct: number;
  isRecommended: boolean;
}

// Exclusive (VVIP) subscription pricing — one flat monthly price for
// every creator, by product decision (the earlier creator-settable price
// is retired; CreatorProfile.vvipPriceOverride is kept in the schema but
// no longer read). VIP Pass pricing is the separate, platform-wide
// VipPassPlan / pricing.vip_pass_usd config ($5/month).
export const EXCLUSIVE_PRICE_USD = 10;

/**
 * The single place that resolves "what does this fan pay per month for
 * a creator's Exclusive subscription" — profile cards, lock CTAs and
 * checkout all go through here. Takes the creator row so call sites
 * don't change if per-creator pricing ever returns.
 */
export async function resolveCreatorPricing(_creator: {
  vvipPriceOverride: unknown; // Prisma.Decimal | null — ignored while pricing is flat
}): Promise<CreatorPricing> {
  return { vvipPriceUsd: EXCLUSIVE_PRICE_USD };
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * What a durationMonths Exclusive package costs: the flat monthly price
 * against the platform's bundle-discount curve (1 month = exactly
 * EXCLUSIVE_PRICE_USD). Per-creator CreatorSubscriptionPlan overrides
 * are not read while pricing is flat.
 */
export async function resolveCreatorPackagePrice(
  _creatorProfileId: string,
  basePriceUsd: number,
  durationMonths: number
): Promise<number> {
  const curve = await getBundleDiscountCurve();
  const discount = curve[String(durationMonths)] ?? 0;
  return roundCents(basePriceUsd * durationMonths * (1 - discount));
}

/**
 * The full 1/3/6/12-month package list for this creator's Exclusive
 * tier, for the checkout plan-picker (Phase 7) — one call resolves
 * everything the UI needs (price, pre-discount comparison price,
 * highlight) rather than the client computing discount math itself.
 */
export async function listCreatorPackages(
  creatorProfileId: string,
  basePriceUsd: number
): Promise<DurationPackage[]> {
  const recommended = await getRecommendedDurationMonths();
  const packages = await Promise.all(
    SUBSCRIPTION_DURATIONS_MONTHS.map(async (durationMonths) => {
      const priceUsd = await resolveCreatorPackagePrice(creatorProfileId, basePriceUsd, durationMonths);
      const undiscountedPriceUsd = roundCents(basePriceUsd * durationMonths);
      const discountPct =
        undiscountedPriceUsd > 0 ? roundCents((1 - priceUsd / undiscountedPriceUsd) * 100) : 0;
      return {
        durationMonths,
        priceUsd,
        undiscountedPriceUsd,
        discountPct,
        isRecommended: durationMonths === recommended,
      };
    })
  );
  return packages;
}

/**
 * The platform-wide VIP Pass's price for a given duration — reads the
 * seeded VipPassPlan table directly (source of truth once seeded; see
 * prisma/seed.ts#seedVipPassPlans), falling back to synthesizing from
 * the base VIP_PASS_PRICE_USD x bundle-discount curve only if a
 * durationMonths row is somehow missing (a fresh environment that
 * hasn't run the seed yet).
 */
export async function resolveVipPassPackagePrice(durationMonths: number): Promise<number> {
  const plan = await db.vipPassPlan.findUnique({ where: { durationMonths } });
  if (plan?.isActive) return Number(plan.priceUsd);

  const config = await getBusinessConfig();
  const curve = await getBundleDiscountCurve();
  const discount = curve[String(durationMonths)] ?? 0;
  return roundCents(config.vipPassPriceUsd * durationMonths * (1 - discount));
}

/** The full 1/3/6/12-month VIP Pass package list, for the checkout plan-picker. */
export async function listVipPassPackages(): Promise<DurationPackage[]> {
  const recommended = await getRecommendedDurationMonths();
  const config = await getBusinessConfig();
  const basePriceUsd = config.vipPassPriceUsd;

  const packages = await Promise.all(
    SUBSCRIPTION_DURATIONS_MONTHS.map(async (durationMonths) => {
      const priceUsd = await resolveVipPassPackagePrice(durationMonths);
      const undiscountedPriceUsd = roundCents(basePriceUsd * durationMonths);
      const discountPct =
        undiscountedPriceUsd > 0 ? roundCents((1 - priceUsd / undiscountedPriceUsd) * 100) : 0;
      return {
        durationMonths,
        priceUsd,
        undiscountedPriceUsd,
        discountPct,
        isRecommended: durationMonths === recommended,
      };
    })
  );
  return packages;
}
