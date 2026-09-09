/**
 * Seed content for the `RevenueShareRule` model — the versioned
 * commercial rules requested for the Founding Partners project:
 *
 *   - Standard Founding Baddie: 80% of VIP/Exclusive revenue.
 *   - Partner-referred creator: 85% of VIP/Exclusive revenue (historical —
 *     no longer read by any live code path, see below).
 *   - Founding Partner's own commission: 10% of a referred creator's net
 *     eligible subscription revenue, for 12 months per referral.
 *
 * There is no separate Partner profit-sharing rule — per explicit
 * product decision, the earlier PARTNER_PROFIT_POOL_SHARE rule (and the
 * annual profit-pool distribution feature that read it) was removed
 * outright, not just left unused.
 *
 * PARTNER_REFERRED_CREATOR_SHARE stays seeded here (never delete a v1
 * row — see the enum's own schema comment) but is dead as of the
 * Founding Partner Programme v2 model: a referred creator now always
 * resolves to the flat STANDARD_CREATOR_SHARE, and the platform's
 * former extra 5% instead funds PARTNER_COMMISSION_RATE.
 *
 * Deliberately NOT PlatformSetting rows: PlatformSetting mutates a single
 * value in place and keeps no history, which fails the "retain historical
 * rule versions" requirement outright. A rule change here means adding a
 * new `version` row (same discipline as prisma/agreements.ts) — existing
 * rows, and every LedgerEntry.revenueShareRuleId already pointing at one,
 * are never edited.
 *
 * STANDARD_CREATOR_SHARE's v1 value (0.8000) matches the value already
 * live today via PlatformSetting's CREATOR_SHARE key — seeding it here is
 * additive, not a behavior change, until src/lib/ledger/service.ts is
 * switched over to read from this model (a later phase).
 */

export interface RevenueShareRuleSeed {
  type: "STANDARD_CREATOR_SHARE" | "PARTNER_REFERRED_CREATOR_SHARE" | "PARTNER_COMMISSION_RATE";
  version: string;
  percentage: string; // Decimal(5,4) as a string, e.g. "0.8000"
  notes: string;
}

export const REVENUE_SHARE_RULES: RevenueShareRuleSeed[] = [
  {
    type: "STANDARD_CREATOR_SHARE",
    version: "v1",
    percentage: "0.8000",
    notes: "Standard Founding Baddie share of VIP/Exclusive revenue (baddies retains the remaining 20%).",
  },
  {
    type: "PARTNER_REFERRED_CREATOR_SHARE",
    version: "v1",
    percentage: "0.8500",
    notes: "Historical (Founding Partner Programme v1) — share of VIP/Exclusive revenue for a partner-referred creator. No longer read by any live code path as of v2; kept for historical LedgerEntry.revenueShareRuleId integrity only.",
  },
  {
    type: "PARTNER_COMMISSION_RATE",
    version: "v1",
    percentage: "0.1000",
    notes: "Founding Partner Programme v2 — a Founding Partner's own commission: 10% of a personally-referred creator's net eligible subscription revenue, for 12 months per referral. Funded from the platform's own share; the referred creator's own cut stays the flat STANDARD_CREATOR_SHARE.",
  },
];
