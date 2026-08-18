-- Rename ContentAccessLevel values to the new tier model (Free / VIP /
-- VVIP; PPV retired from the product but the enum value is intentionally
-- left in place — Postgres cannot drop a single enum value without
-- recreating the type). Order matters: free up "VIP" before reusing it.
ALTER TYPE "ContentAccessLevel" RENAME VALUE 'VIP' TO 'VVIP';
ALTER TYPE "ContentAccessLevel" RENAME VALUE 'ENTRY' TO 'VIP';
ALTER TYPE "ContentAccessLevel" RENAME VALUE 'PUBLIC_PREVIEW' TO 'FREE';

-- Creator subscriptions collapse to a single tier (VVIP) — drop the
-- now-unused tier distinction entirely rather than leaving a
-- always-the-same-value column around.
ALTER TABLE "subscriptions" DROP COLUMN "tier";
DROP TYPE "SubscriptionTier";

-- Collapse the two per-creator pricing overrides into one VVIP price.
-- Existing vipPriceOverride wins (closer in spirit to the new VVIP tier);
-- falls back to the old entryPriceOverride if only that was set.
ALTER TABLE "creator_profiles" ADD COLUMN "vvipPriceOverride" DECIMAL(10,2);
UPDATE "creator_profiles" SET "vvipPriceOverride" = COALESCE("vipPriceOverride", "entryPriceOverride");
ALTER TABLE "creator_profiles" DROP COLUMN "entryPriceOverride";
ALTER TABLE "creator_profiles" DROP COLUMN "vipPriceOverride";

-- CreateTable
CREATE TABLE "content_likes" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_likes_contentId_idx" ON "content_likes"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "content_likes_fanId_contentId_key" ON "content_likes"("fanId", "contentId");

-- AddForeignKey
ALTER TABLE "content_likes" ADD CONSTRAINT "content_likes_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_likes" ADD CONSTRAINT "content_likes_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
