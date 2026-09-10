-- Carousel support: which slide a MediaAsset belongs to within its
-- Content. Purely additive — one new NOT-NULL-defaulted column plus a
-- composite index for ordered per-content retrieval. position defaults
-- to 0 for every existing row, which is correct: every post created
-- before this migration is effectively a 1-item carousel already at
-- position 0 — both its ORIGINAL and, if present, DISPLAY asset share
-- position 0 (they're the same slide, not two slides).
ALTER TABLE "media_assets" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "media_assets_contentId_position_idx" ON "media_assets"("contentId", "position");
