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

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Resolves what a specific durationMonths package actually costs for
 * this creator's Exclusive tier: a creator's own explicit
 * CreatorSubscriptionPlan override for that duration if they've set
 * one, else the base 1-month price (resolveCreatorPricing) synthesized
 * against the platform's bundle-discount curve. A creator never needs
 * to set every duration explicitly — only the ones they want to
 * customize.
 */
export async function resolveCreatorPackagePrice(
  creatorProfileId: string,
  basePriceUsd: number,
  durationMonths: number
): Promise<number> {
  const override = await db.creatorSubscriptionPlan.findUnique({
    where: { creatorProfileId_durationMonths: { creatorProfileId, durationMonths } },
  });
  if (override?.isActive) {
    return Math.max(roundCents(Number(override.priceUsd)), EXCLUSIVE_MIN_PRICE_USD);
  }

  const curve = await getBundleDiscountCurve();
  const discount = curve[String(durationMonths)] ?? 0;
  return Math.max(roundCents(basePriceUsd * durationMonths * (1 - discount)), EXCLUSIVE_MIN_PRICE_USD);
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
