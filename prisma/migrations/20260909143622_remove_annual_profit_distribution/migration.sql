-- Remove the annual profit-pool distribution feature outright, per
-- explicit product decision: Founding Partner compensation is direct
-- referral revenue share only, with no separate profit-sharing
-- mechanism. Drops PartnerProfitShare/AnnualProfitDistribution
-- entirely, and removes the now-unused PARTNER_PROFIT_POOL_SHARE value
-- from RevenueShareRuleType (deleting any row using it first, since a
-- narrowed enum can't be applied to a column still referencing the
-- removed value).

-- DropTable (child first — FK to annual_profit_distributions and to founding_partners)
DROP TABLE IF EXISTS "partner_profit_shares";

-- DropTable
DROP TABLE IF EXISTS "annual_profit_distributions";

-- DropEnum
DROP TYPE IF EXISTS "ProfitDistributionStatus";

-- Remove any RevenueShareRule row of the type being dropped — none are
-- ever referenced by a LedgerEntry (confirmed: nothing outside the
-- now-removed finalize route ever read this rule type), so this is a
-- clean delete, not a cascade into financial records.
DELETE FROM "revenue_share_rules" WHERE "type" = 'PARTNER_PROFIT_POOL_SHARE';

-- Narrow RevenueShareRuleType: STANDARD_CREATOR_SHARE and
-- PARTNER_REFERRED_CREATOR_SHARE only. Postgres has no direct "drop
-- enum value" — the standard safe pattern is: rename the old type,
-- create the new (narrower) one, repoint the column at it, drop the old.
ALTER TYPE "RevenueShareRuleType" RENAME TO "RevenueShareRuleType_old";

CREATE TYPE "RevenueShareRuleType" AS ENUM ('STANDARD_CREATOR_SHARE', 'PARTNER_REFERRED_CREATOR_SHARE');

ALTER TABLE "revenue_share_rules"
  ALTER COLUMN "type" TYPE "RevenueShareRuleType" USING ("type"::text::"RevenueShareRuleType");

DROP TYPE "RevenueShareRuleType_old";
