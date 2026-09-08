-- "Go Live" feature removed outright (see src/app/api/creator/live/route.ts's
-- deletion) — no fan-facing UI or API ever reads these again.
ALTER TABLE "creator_profiles" DROP COLUMN "isLive";
ALTER TABLE "creator_profiles" DROP COLUMN "liveStartedAt";

-- Marks a creator as part of the original founding cohort (see
-- CreatorProfile.isFoundingBaddie's comment in schema.prisma) — drives
-- the "Founding baddie" vs. plain "baddie" verified badge.
ALTER TABLE "creator_profiles" ADD COLUMN "isFoundingBaddie" BOOLEAN NOT NULL DEFAULT false;
