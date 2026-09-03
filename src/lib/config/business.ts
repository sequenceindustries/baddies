/**
 * Business configuration.
 *
 * IMPORTANT: These constants are DEFAULT SEED VALUES ONLY, used to populate
 * `platform_settings` on first run and as a fallback in tests. They must
 * never be imported directly by pricing/entitlement/ledger logic in
 * application code — always read through `getPlatformSetting()` /
 * `getBusinessConfig()` in ./settings.ts, which reads from the database.
 *
 * This indirection is what lets Baddies change pricing or revenue share
 * without a code deploy, per the build brief (§32, §36).
 */

// Tier model (see prisma/schema.prisma's ContentAccessLevel comment):
//   VVIP_DEFAULT_PRICE_USD — fallback per-creator subscription price when
//     a creator hasn't set CreatorProfile.vvipPriceOverride
//   VIP_PASS_PRICE_USD — the single platform-wide VIP pass price (backed
//     by the UnlimitedSubscription model; renamed at the business-config
//     level only, to avoid a larger model-rename blast radius)
export const BUSINESS_CONFIG_KEYS = {
  VVIP_DEFAULT_PRICE_USD: "pricing.vvip_usd",
  VIP_PASS_PRICE_USD: "pricing.vip_pass_usd",
  CREATOR_SHARE: "revenue.creator_share",
  PLATFORM_SHARE: "revenue.platform_share",
  UNLIMITED_ALLOCATION_MODEL: "unlimited.allocation_model",
  // How many Founding Baddies this cohort is recruiting for — the admin
  // Command Centre's progress bar ("current / target"). A headcount
  // goal, not a pricing/revenue rule, but the same "don't hard-code
  // business numbers in dashboard code" reasoning applies.
  FOUNDING_BADDIES_TARGET: "founding_baddies.target",
} as const;

export type BusinessConfigKey =
  (typeof BUSINESS_CONFIG_KEYS)[keyof typeof BUSINESS_CONFIG_KEYS];

/** Default values used only to seed `platform_settings` (see prisma/seed.ts). */
export const DEFAULT_BUSINESS_CONFIG: Record<BusinessConfigKey, string> = {
  [BUSINESS_CONFIG_KEYS.VVIP_DEFAULT_PRICE_USD]: "9.99",
  [BUSINESS_CONFIG_KEYS.VIP_PASS_PRICE_USD]: "19.99",
  // Locked MVP assumption per build brief §3 — still stored as config, not
  // a literal scattered through pricing/ledger code, so it can be revisited
  // per-creator or platform-wide without a redeploy.
  [BUSINESS_CONFIG_KEYS.CREATOR_SHARE]: "0.80",
  [BUSINESS_CONFIG_KEYS.PLATFORM_SHARE]: "0.20",
  // See src/lib/entitlements/unlimited.ts — "consumption" is the initial
  // allocation model per build brief §2, but the engine is pluggable.
  [BUSINESS_CONFIG_KEYS.UNLIMITED_ALLOCATION_MODEL]: "consumption",
  [BUSINESS_CONFIG_KEYS.FOUNDING_BADDIES_TARGET]: "50",
};

export type UnlimitedAllocationModel =
  | "consumption"
  | "engagement"
  | "hybrid"
  | "minimum_guarantee";
