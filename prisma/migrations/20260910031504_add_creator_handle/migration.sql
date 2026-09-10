-- Social-feed follow-up: a real, unique, creator-chosen handle
-- ("@handle") — a social-media-style username system, separate from
-- Profile.displayName (not unique, can contain spaces/emoji). Fully
-- additive/nullable: every existing creator simply has no handle until
-- they set one from Profile's own creator settings form — handles are
-- opt-in, never auto-generated from displayName (avoids inventing
-- low-quality slugs / collisions from existing names). Format
-- (lowercase letters/digits/underscores, 3-20 chars) is enforced in
-- application code (src/app/api/creator/settings/route.ts's
-- HANDLE_REGEX), not a DB constraint.

-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN     "handle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_handle_key" ON "creator_profiles"("handle");
