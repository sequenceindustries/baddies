-- Creator opt-out for fan messaging. Messaging today has zero gating
-- anywhere (any signed-in user can message any verified creator) - this
-- one new column, defaulted true, preserves that behavior for every
-- existing creator until they actively turn it off. Purely additive,
-- no existing column touched.
ALTER TABLE "creator_profiles" ADD COLUMN "acceptsMessages" BOOLEAN NOT NULL DEFAULT true;
