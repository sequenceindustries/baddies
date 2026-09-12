-- Monetisation redesign, Phase 1 (schema foundation only) — additive,
-- no behavior change. Nothing existing reads or writes any of these
-- new tables/columns yet; that happens in later phases. Verified
-- against a real non-empty dev DB (subscriptions/unlimited_subscriptions
-- checked for duplicate paymentProviderSubscriptionId values before
-- adding the unique constraints below — none found).

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('EXCLUSIVE_SUBSCRIPTION', 'VIP_PASS');

-- CreateEnum
CREATE TYPE "PendingOrderStatus" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- AlterTable "subscriptions"
-- durationMonths/renewalReminderSentAt are new, purely additive
-- lifecycle-tracking fields (see Subscription's own schema comment).
-- paymentProviderSubscriptionId becomes unique for webhook idempotency
-- (Phase 2) — confirmed no existing duplicates before adding this.
ALTER TABLE "subscriptions" ADD COLUMN     "durationMonths" INTEGER,
ADD COLUMN     "renewalReminderSentAt" TIMESTAMP(3);

-- AlterTable "unlimited_subscriptions" — same additions, same reasoning.
ALTER TABLE "unlimited_subscriptions" ADD COLUMN     "durationMonths" INTEGER,
ADD COLUMN     "renewalReminderSentAt" TIMESTAMP(3);

-- AlterTable "wallets"
-- Progressive-accrual "scheduled" (not-yet-recognized future months)
-- bucket — a pure read-model, same as the 3 existing cached* fields,
-- only ever written by recomputeWalletBalances (Phase 3). Folded into
-- the displayed "Pending" figure per direct product decision; tracked
-- separately here for audit purposes.
ALTER TABLE "wallets" ADD COLUMN     "cachedScheduledBalanceUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable "ledger_entries"
-- Set only on a SUBSCRIPTION entry for a multi-month package (Phase 3);
-- every other entry type leaves both null and is unaffected.
ALTER TABLE "ledger_entries" ADD COLUMN     "recognitionStartAt" TIMESTAMP(3),
ADD COLUMN     "durationMonths" INTEGER;

-- AlterTable "creator_profiles"
-- Creator Activity Policy signal (Phase 6/8) — lazily read, never
-- cron-updated, same convention as FanTrial/Story. Null means
-- "unknown, not yet inactive," never treated as inactive by
-- isCreatorActive(). A future-eligibility signal only; never reduces
-- money already earned.
ALTER TABLE "creator_profiles" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateTable
-- A creator's own price override for one Exclusive package duration.
-- A creator only needs a row here for a duration they've explicitly
-- customized; every other duration synthesizes from the base 1-month
-- price x the platform's bundle-discount curve (see
-- resolveCreatorPricing, Phase 2).
CREATE TABLE "creator_subscription_plans" (
    "id" TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- The platform-wide VIP Pass's price per package duration — never
-- per-creator, matching VIP being a single platform-wide membership.
-- Seeded for 1/3/6/12 months in prisma/seed.ts.
CREATE TABLE "vip_pass_plans" (
    "id" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_pass_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- The "pending order" concept the checkout routes' own doc comments
-- already called for once a real payment vendor exists (Phase 2):
-- baddies -> (this row) -> payment provider -> hosted checkout ->
-- webhook confirmation -> Subscription/UnlimitedSubscription +
-- LedgerEntry. providerCheckoutId/providerPaymentId are both unique so
-- a webhook can always resolve back to exactly one order.
CREATE TABLE "pending_orders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "creatorProfileId" TEXT,
    "durationMonths" INTEGER NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PendingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "providerName" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "resultingSubscriptionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Webhook-delivery idempotency ledger (Phase 2) — every inbound
-- payment-provider webhook is recorded here BEFORE being processed,
-- keyed on the provider's own event id, so a redelivered/duplicate
-- webhook is detected and skipped rather than double-activating an
-- entitlement or double-posting a LedgerEntry.
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_paymentProviderSubscriptionId_key" ON "subscriptions"("paymentProviderSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_currentPeriodEnd_idx" ON "subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "unlimited_subscriptions_paymentProviderSubscriptionId_key" ON "unlimited_subscriptions"("paymentProviderSubscriptionId");

-- CreateIndex
CREATE INDEX "unlimited_subscriptions_currentPeriodEnd_idx" ON "unlimited_subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "creator_subscription_plans_creatorProfileId_durationMonths_key" ON "creator_subscription_plans"("creatorProfileId", "durationMonths");

-- CreateIndex
CREATE UNIQUE INDEX "vip_pass_plans_durationMonths_key" ON "vip_pass_plans"("durationMonths");

-- CreateIndex
CREATE UNIQUE INDEX "pending_orders_providerCheckoutId_key" ON "pending_orders"("providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "pending_orders_providerPaymentId_key" ON "pending_orders"("providerPaymentId");

-- CreateIndex
CREATE INDEX "pending_orders_customerId_idx" ON "pending_orders"("customerId");

-- CreateIndex
CREATE INDEX "pending_orders_status_idx" ON "pending_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEventId_key" ON "webhook_events"("provider", "providerEventId");

-- Defensive cleanup, discovered when this migration first failed to
-- apply against production with a real FK violation: at least one
-- `subscriptions` row's creatorProfileId does not exist in
-- creator_profiles at all. Nothing ever prevented this before this
-- migration (no FK existed on this column), so it's pre-existing dead
-- data, not something this migration causes. Deleting it is safe: it
-- points at a creator profile that no longer exists, so every real
-- entitlement/content query (which always joins through a live
-- CreatorProfile) already treated it as unreachable — this can never
-- have been live, meaningful access for a real fan. A no-op wherever
-- no such row exists (this dev database included). Logged via
-- RAISE NOTICE so the exact count is visible in deploy logs.
DO $$
DECLARE
  orphaned_count integer;
BEGIN
  SELECT count(*) INTO orphaned_count
  FROM subscriptions s
  LEFT JOIN creator_profiles cp ON cp.id = s."creatorProfileId"
  WHERE cp.id IS NULL;

  IF orphaned_count > 0 THEN
    RAISE NOTICE 'Deleting % orphaned subscription row(s) whose creatorProfileId has no matching creator_profiles row, before adding the FK constraint', orphaned_count;
    DELETE FROM subscriptions s
    WHERE NOT EXISTS (SELECT 1 FROM creator_profiles cp WHERE cp.id = s."creatorProfileId");
  END IF;
END $$;

-- AddForeignKey
-- Genuine fix: subscriptions.creatorProfileId had NO foreign key
-- constraint at all before this migration. RESTRICT (not CASCADE) —
-- a creator profile must never be deletable while real, paid
-- subscription/ledger history references it, per the monetisation
-- spec's "preserve historical subscription/payment records"
-- requirement.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
