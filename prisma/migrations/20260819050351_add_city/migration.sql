-- Add city alongside the existing country field. Nullable at the DB
-- level (no backfill for existing rows) — required going forward at the
-- application layer, see RegisterSchema and UpdateProfileSchema.
ALTER TABLE "profiles" ADD COLUMN "city" TEXT;
