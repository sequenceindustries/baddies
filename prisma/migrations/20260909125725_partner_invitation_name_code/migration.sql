-- PartnerInvitation: identify invites by name + a generated reference
-- code instead of requiring an email address.
--
-- Corrected from the first version of this migration, which assumed
-- the table was empty everywhere (true in local dev, false in
-- production — it failed there with a NOT NULL violation on `name`).
-- This version adds both new columns nullable first, backfills any
-- existing rows, then applies the NOT NULL/UNIQUE constraints — safe
-- whether the table is empty or not.

-- AlterTable
ALTER TABLE "partner_invitations"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "code" TEXT;

-- Backfill: `email` is the closest thing to a real name any pre-existing
-- row has (it was the only identifying field before this migration) —
-- an honest, reviewable stand-in an admin can correct manually, not a
-- fabricated name.
UPDATE "partner_invitations" SET "name" = "email" WHERE "name" IS NULL;

-- Backfill: a deterministic, collision-free code per existing row,
-- offset into the top of the 6-digit range (900001+) so it can't
-- collide with a freshly-generated one from generateUniqueInvitationCode
-- (which picks from the full 100000-999999 range and already retries on
-- a uniqueness conflict regardless).
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt") AS "rn"
  FROM "partner_invitations"
  WHERE "code" IS NULL
)
UPDATE "partner_invitations" p
SET "code" = lpad((900000 + numbered."rn")::text, 6, '0')
FROM numbered
WHERE p."id" = numbered."id";

-- AlterTable
ALTER TABLE "partner_invitations"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "partner_invitations_code_key" ON "partner_invitations"("code");

-- CreateIndex
CREATE INDEX "partner_invitations_name_idx" ON "partner_invitations"("name");
