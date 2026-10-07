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
  // MASTER REQUIREMENTS §11 — "Build the data model so trial rules can
  // be changed later... Do not hardcode the trial logic." TRIAL_ENABLED
  // is a simple kill switch; TRIAL_DURATION_HOURS controls how long a
  // newly-registered fan's grant lasts (see src/app/api/auth/register/route.ts).
  TRIAL_ENABLED: "trial.enabled",
  TRIAL_DURATION_HOURS: "trial.duration_hours",
  // Monetisation redesign — prepaid package bundling. A JSON object
  // mapping durationMonths -> discount fraction off the base 1-month
  // price, e.g. {"1":0,"3":0.10,"6":0.15,"12":0.25}. Read by
  // resolveCreatorPricing()/the VipPassPlan seed to synthesize
  // per-duration prices from the existing base price — never hardcoded
  // into pricing logic directly, so the business can retune bundle
  // economics without a redeploy. See RECOMMENDED_DURATION_MONTHS for
  // which package is visually highlighted at checkout.
  PRICING_BUNDLE_DISCOUNT_CURVE: "pricing.bundle_discount_curve",
  PRICING_RECOMMENDED_DURATION_MONTHS: "pricing.recommended_duration_months",
  // Creator dashboard "Content Mix" comparison — the recommended (never
  // enforced) Teasers/VIP/Exclusive content split. Deliberately
  // adjustable, not hard-coded, per direct product decision: these
  // starting numbers (10/20/70) are expected to change as real
  // platform data comes in.
  CONTENT_MIX_TARGET_TEASERS_PCT: "content_mix.target_teasers_pct",
  CONTENT_MIX_TARGET_VIP_PCT: "content_mix.target_vip_pct",
  CONTENT_MIX_TARGET_EXCLUSIVE_PCT: "content_mix.target_exclusive_pct",
  // Creator Activity Policy — days of inactivity (see
  // src/lib/creator/activity.ts#isCreatorActive) after which a creator
  // is excluded from FUTURE VIP Pool distribution periods only. Never
  // affects Exclusive subscriptions already in place or money already
  // earned/available — see that module's own comment.
  ACTIVITY_INACTIVITY_THRESHOLD_DAYS: "activity.inactivity_threshold_days",
} as const;

export type BusinessConfigKey =
  (typeof BUSINESS_CONFIG_KEYS)[keyof typeof BUSINESS_CONFIG_KEYS];

/** Default values used only to seed `platform_settings` (see prisma/seed.ts). */
export const DEFAULT_BUSINESS_CONFIG: Record<BusinessConfigKey, string> = {
  [BUSINESS_CONFIG_KEYS.VVIP_DEFAULT_PRICE_USD]: "10.00",
  [BUSINESS_CONFIG_KEYS.VIP_PASS_PRICE_USD]: "5.00",
  // Locked MVP assumption per build brief §3 — still stored as config, not
  // a literal scattered through pricing/ledger code, so it can be revisited
  // per-creator or platform-wide without a redeploy.
  [BUSINESS_CONFIG_KEYS.CREATOR_SHARE]: "0.80",
  [BUSINESS_CONFIG_KEYS.PLATFORM_SHARE]: "0.20",
  // See src/lib/entitlements/unlimited.ts — "consumption" is the initial
  // allocation model per build brief §2, but the engine is pluggable.
  [BUSINESS_CONFIG_KEYS.UNLIMITED_ALLOCATION_MODEL]: "consumption",
  [BUSINESS_CONFIG_KEYS.TRIAL_ENABLED]: "true",
  [BUSINESS_CONFIG_KEYS.TRIAL_DURATION_HOURS]: "24",
  // Illustrative starting curve — 3mo/6mo/12mo save 10%/15%/25% off the
  // 1-month price. A business call, not an engineering default; change
  // via PlatformSetting, no redeploy needed.
  [BUSINESS_CONFIG_KEYS.PRICING_BUNDLE_DISCOUNT_CURVE]: JSON.stringify({
    "1": 0,
    "3": 0.1,
    "6": 0.15,
    "12": 0.25,
  }),
  [BUSINESS_CONFIG_KEYS.PRICING_RECOMMENDED_DURATION_MONTHS]: "3",
  [BUSINESS_CONFIG_KEYS.CONTENT_MIX_TARGET_TEASERS_PCT]: "10",
  [BUSINESS_CONFIG_KEYS.CONTENT_MIX_TARGET_VIP_PCT]: "20",
  [BUSINESS_CONFIG_KEYS.CONTENT_MIX_TARGET_EXCLUSIVE_PCT]: "70",
  [BUSINESS_CONFIG_KEYS.ACTIVITY_INACTIVITY_THRESHOLD_DAYS]: "45",
};

export type UnlimitedAllocationModel =
  | "consumption"
  | "engagement"
  | "hybrid"
  | "minimum_guarantee";
