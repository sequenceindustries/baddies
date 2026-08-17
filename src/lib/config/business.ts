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

export const BUSINESS_CONFIG_KEYS = {
  ENTRY_PRICE_USD: "pricing.entry_usd",
  VIP_PRICE_USD: "pricing.vip_usd",
  UNLIMITED_PRICE_USD: "pricing.unlimited_usd",
  CREATOR_SHARE: "revenue.creator_share",
  PLATFORM_SHARE: "revenue.platform_share",
  UNLIMITED_ALLOCATION_MODEL: "unlimited.allocation_model",
} as const;

export type BusinessConfigKey =
  (typeof BUSINESS_CONFIG_KEYS)[keyof typeof BUSINESS_CONFIG_KEYS];

/** Default values used only to seed `platform_settings` (see prisma/seed.ts). */
export const DEFAULT_BUSINESS_CONFIG: Record<BusinessConfigKey, string> = {
  [BUSINESS_CONFIG_KEYS.ENTRY_PRICE_USD]: "2.99",
  [BUSINESS_CONFIG_KEYS.VIP_PRICE_USD]: "9.99",
  [BUSINESS_CONFIG_KEYS.UNLIMITED_PRICE_USD]: "19.99",
  // Locked MVP assumption per build brief §3 — still stored as config, not
  // a literal scattered through pricing/ledger code, so it can be revisited
  // per-creator or platform-wide without a redeploy.
  [BUSINESS_CONFIG_KEYS.CREATOR_SHARE]: "0.80",
  [BUSINESS_CONFIG_KEYS.PLATFORM_SHARE]: "0.20",
  // See src/lib/entitlements/unlimited.ts — "consumption" is the initial
  // allocation model per build brief §2, but the engine is pluggable.
  [BUSINESS_CONFIG_KEYS.UNLIMITED_ALLOCATION_MODEL]: "consumption",
};

export type UnlimitedAllocationModel =
  | "consumption"
  | "engagement"
  | "hybrid"
  | "minimum_guarantee";
