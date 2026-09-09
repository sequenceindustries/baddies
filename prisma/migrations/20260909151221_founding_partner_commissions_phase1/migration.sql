-- Founding Partner Programme v2, Phase 1 (data model only) — additive,
-- zero behavior change. Nothing existing is read differently by this
-- migration; postRevenueEvent/postReversalEvent are wired up to the new
-- tables/columns in a later phase.

-- CreateEnum
CREATE TYPE "PartnerCommissionStatus" AS ENUM ('PENDING', 'HELD', 'REVERSED');

-- CreateEnum
CREATE TYPE "AbuseFlagType" AS ENUM ('SELF_REFERRAL_ATTEMPT', 'DUPLICATE_APPLICATION_ATTEMPT', 'MULTIPLE_ACCOUNTS_SAME_REFERRAL', 'SUSPICIOUS_REFUND_PATTERN', 'SUSPICIOUS_CHARGEBACK_PATTERN', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AbuseFlagStatus" AS ENUM ('OPEN', 'REVIEWING', 'DISMISSED', 'CONFIRMED');

-- AlterEnum
-- New LedgerEventType values for commission entries posted against a
-- partner's own wallet. Not read by any code path yet (Phase 2).
ALTER TYPE "LedgerEventType" ADD VALUE 'PARTNER_COMMISSION';
ALTER TYPE "LedgerEventType" ADD VALUE 'PARTNER_COMMISSION_REVERSAL';

-- AlterEnum
-- A Founding Partner's own commission rate — versioned via
-- RevenueShareRule exactly like the two existing types. Seeded v1 =
-- 0.1000 in prisma/revenue-rules.ts / prisma/seed.ts.
ALTER TYPE "RevenueShareRuleType" ADD VALUE 'PARTNER_COMMISSION_RATE';

-- DropIndex
-- Pre-existing drift: the 2026-09-09 name/code migration added
-- partner_invitations_name_idx but never dropped the old email index
-- once "email" stopped being the invitation's primary identifier —
-- cleaning it up here since this migration already touches this table.
DROP INDEX "partner_invitations_email_idx";

-- AlterTable
-- Rank among all acceptances so far ("Founding Partner #23 of 50"),
-- set once at accept time (Phase 2), never recomputed afterward.
ALTER TABLE "founding_partners" ADD COLUMN     "joinedPositionNumber" INTEGER;

-- AlterTable
-- Admin-set explicit override of the 50-Founding-Partner cap, checked
-- only at accept time (Phase 2) — false for every ordinary invite.
ALTER TABLE "partner_invitations" ADD COLUMN     "capOverride" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- A referred creator's individual 12-month commission-earning window.
-- Both null until "activation" (first real SUBSCRIPTION revenue event
-- for that creator, set lazily in Phase 2).
ALTER TABLE "referral_attributions" ADD COLUMN     "earningPeriodEndAt" TIMESTAMP(3),
ADD COLUMN     "earningPeriodStartAt" TIMESTAMP(3);

-- CreateTable
-- One row per originating SUBSCRIPTION LedgerEntry (sourceLedgerEntryId
-- unique). PENDING/HELD/REVERSED only — "payable" and "paid" are
-- deliberately answered by the existing recomputeWalletBalances split
-- and Payout model respectively, not duplicated here.
CREATE TABLE "partner_commissions" (
    "id" TEXT NOT NULL,
    "foundingPartnerId" TEXT NOT NULL,
    "referralAttributionId" TEXT NOT NULL,
    "sourceLedgerEntryId" TEXT NOT NULL,
    "revenueShareRuleId" TEXT NOT NULL,
    "netEligibleAmountUsd" DECIMAL(12,2) NOT NULL,
    "commissionAmountUsd" DECIMAL(12,2) NOT NULL,
    "reversedAmountUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PartnerCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "payoutLedgerEntryId" TEXT,
    "heldBy" TEXT,
    "heldReason" TEXT,
    "heldAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Narrow, rule-based fraud/abuse flagging for this programme only —
-- never auto-confiscates anything, only ever prompts human review.
CREATE TABLE "abuse_flags" (
    "id" TEXT NOT NULL,
    "type" "AbuseFlagType" NOT NULL,
    "status" "AbuseFlagStatus" NOT NULL DEFAULT 'OPEN',
    "foundingPartnerId" TEXT,
    "foundingApplicationId" TEXT,
    "referralAttributionId" TEXT,
    "partnerCommissionId" TEXT,
    "reason" TEXT NOT NULL,
    "autoDetected" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abuse_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_commissions_sourceLedgerEntryId_key" ON "partner_commissions"("sourceLedgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_commissions_payoutLedgerEntryId_key" ON "partner_commissions"("payoutLedgerEntryId");

-- CreateIndex
CREATE INDEX "partner_commissions_foundingPartnerId_idx" ON "partner_commissions"("foundingPartnerId");

-- CreateIndex
CREATE INDEX "partner_commissions_status_idx" ON "partner_commissions"("status");

-- CreateIndex
CREATE INDEX "partner_commissions_referralAttributionId_idx" ON "partner_commissions"("referralAttributionId");

-- CreateIndex
CREATE INDEX "abuse_flags_status_idx" ON "abuse_flags"("status");

-- CreateIndex
CREATE INDEX "abuse_flags_foundingPartnerId_idx" ON "abuse_flags"("foundingPartnerId");

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_foundingPartnerId_fkey" FOREIGN KEY ("foundingPartnerId") REFERENCES "founding_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_referralAttributionId_fkey" FOREIGN KEY ("referralAttributionId") REFERENCES "referral_attributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_sourceLedgerEntryId_fkey" FOREIGN KEY ("sourceLedgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_revenueShareRuleId_fkey" FOREIGN KEY ("revenueShareRuleId") REFERENCES "revenue_share_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_payoutLedgerEntryId_fkey" FOREIGN KEY ("payoutLedgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_foundingPartnerId_fkey" FOREIGN KEY ("foundingPartnerId") REFERENCES "founding_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_foundingApplicationId_fkey" FOREIGN KEY ("foundingApplicationId") REFERENCES "founding_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_referralAttributionId_fkey" FOREIGN KEY ("referralAttributionId") REFERENCES "referral_attributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_partnerCommissionId_fkey" FOREIGN KEY ("partnerCommissionId") REFERENCES "partner_commissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bump the Founding Baddies target from 50 to 300 (Founding Partner
-- Programme v2 relaunch) — guarded so it never clobbers a value an
-- admin has already changed away from the original seeded "50", and a
-- no-op if this row doesn't exist yet (a fresh environment picks up the
-- new "300" default straight from prisma/seed.ts instead).
UPDATE "platform_settings"
SET "value" = '300'
WHERE "key" = 'founding_baddies.target' AND "value" = '50';
