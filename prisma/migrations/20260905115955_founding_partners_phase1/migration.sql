-- CreateEnum
CREATE TYPE "PartnerInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FoundingPartnerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RevenueShareRuleType" AS ENUM ('STANDARD_CREATOR_SHARE', 'PARTNER_REFERRED_CREATOR_SHARE', 'PARTNER_PROFIT_POOL_SHARE');

-- CreateEnum
CREATE TYPE "ProfitDistributionStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- AlterEnum
ALTER TYPE "AgreementType" ADD VALUE 'PARTNER_AGREEMENT';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PARTNER';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "foundingPartnerId" TEXT,
ADD COLUMN     "revenueShareRuleId" TEXT;

-- CreateTable
CREATE TABLE "partner_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PartnerInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "resentAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founding_partners" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "FoundingPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitationId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "suspendedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founding_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_attributions" (
    "id" TEXT NOT NULL,
    "foundingApplicationId" TEXT NOT NULL,
    "foundingPartnerId" TEXT NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'referral_link',
    "correctedBy" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_share_rules" (
    "id" TEXT NOT NULL,
    "type" "RevenueShareRuleType" NOT NULL,
    "version" TEXT NOT NULL,
    "percentage" DECIMAL(5,4) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_share_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_profit_distributions" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "ProfitDistributionStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDistributableProfitUsd" DECIMAL(12,2),
    "computedBy" TEXT,
    "computedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annual_profit_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_profit_shares" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "foundingPartnerId" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_profit_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_invitations_email_idx" ON "partner_invitations"("email");

-- CreateIndex
CREATE INDEX "partner_invitations_status_idx" ON "partner_invitations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "founding_partners_userId_key" ON "founding_partners"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "founding_partners_invitationId_key" ON "founding_partners"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "founding_partners_referralCode_key" ON "founding_partners"("referralCode");

-- CreateIndex
CREATE INDEX "founding_partners_status_idx" ON "founding_partners"("status");

-- CreateIndex
CREATE UNIQUE INDEX "referral_attributions_foundingApplicationId_key" ON "referral_attributions"("foundingApplicationId");

-- CreateIndex
CREATE INDEX "referral_attributions_foundingPartnerId_idx" ON "referral_attributions"("foundingPartnerId");

-- CreateIndex
CREATE INDEX "revenue_share_rules_type_idx" ON "revenue_share_rules"("type");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_share_rules_type_version_key" ON "revenue_share_rules"("type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "annual_profit_distributions_year_key" ON "annual_profit_distributions"("year");

-- CreateIndex
CREATE UNIQUE INDEX "partner_profit_shares_distributionId_foundingPartnerId_key" ON "partner_profit_shares"("distributionId", "foundingPartnerId");

-- CreateIndex
CREATE INDEX "ledger_entries_foundingPartnerId_idx" ON "ledger_entries"("foundingPartnerId");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_foundingPartnerId_fkey" FOREIGN KEY ("foundingPartnerId") REFERENCES "founding_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_revenueShareRuleId_fkey" FOREIGN KEY ("revenueShareRuleId") REFERENCES "revenue_share_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founding_partners" ADD CONSTRAINT "founding_partners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founding_partners" ADD CONSTRAINT "founding_partners_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "partner_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_foundingPartnerId_fkey" FOREIGN KEY ("foundingPartnerId") REFERENCES "founding_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_profit_shares" ADD CONSTRAINT "partner_profit_shares_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "annual_profit_distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_profit_shares" ADD CONSTRAINT "partner_profit_shares_foundingPartnerId_fkey" FOREIGN KEY ("foundingPartnerId") REFERENCES "founding_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
