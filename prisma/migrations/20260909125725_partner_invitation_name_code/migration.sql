-- PartnerInvitation: identify invites by name + a generated reference
-- code instead of requiring an email address. Table is empty in every
-- environment this has shipped to (feature not yet used in production),
-- so no backfill is needed for the new NOT NULL columns.

-- AlterTable
ALTER TABLE "partner_invitations"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "name" TEXT NOT NULL,
  ADD COLUMN "code" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "partner_invitations_code_key" ON "partner_invitations"("code");

-- CreateIndex
CREATE INDEX "partner_invitations_name_idx" ON "partner_invitations"("name");
