-- Media storage migration (Postgres-BYTEA stub -> Cloudflare R2), Phase 1.
-- Purely additive: a new enum and three new nullable/defaulted columns on
-- media_assets. No existing column touched, dropped, or retyped.
--
-- kind defaults to 'ORIGINAL' for every existing row, which is correct --
-- every row that exists before this migration is a stub-era original,
-- never a generated display derivative (the DISPLAY kind starts being
-- written by src/app/api/creator/content/route.ts once the image
-- pipeline ships, this same phase).
CREATE TYPE "MediaAssetKind" AS ENUM ('ORIGINAL', 'DISPLAY');

ALTER TABLE "media_assets" ADD COLUMN "kind" "MediaAssetKind" NOT NULL DEFAULT 'ORIGINAL';
ALTER TABLE "media_assets" ADD COLUMN "width" INTEGER;
ALTER TABLE "media_assets" ADD COLUMN "height" INTEGER;
