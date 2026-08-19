-- "Go Live" status flag for creators (see CreatorProfile.isLive's comment
-- in schema.prisma) — additive, nullable/defaulted, no backfill needed.
ALTER TABLE "creator_profiles" ADD COLUMN "isLive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "creator_profiles" ADD COLUMN "liveStartedAt" TIMESTAMP(3);
