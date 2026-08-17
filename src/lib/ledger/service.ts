import { db } from "@/lib/db/client";
import { getBusinessConfig } from "@/lib/config/settings";
import type { LedgerEventType } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Ledger service. Per build brief §20: "Use an immutable ledger. Do not
 * store creator balance as a manually mutable number. Balance should be
 * derived from ledger events."
 *
 * Rules enforced here:
 * - LedgerEntry rows are append-only. This module never updates or deletes
 *   a LedgerEntry — reversals are new entries (REFUND, CHARGEBACK,
 *   PAYOUT_REVERSAL, ADJUSTMENT), never edits.
 * - Wallet.cached*Balance fields are a read-model, recomputed by
 *   `recomputeWalletBalances`, never written directly by business logic.
 * - Revenue split (creator/platform share) is captured on the entry at
 *   write time from the current PlatformSetting, per build brief §3: "Do
 *   NOT simply subtract costs from the creator's displayed percentage
 *   without an explicit business rule."
 */

export interface RevenueEventInput {
  walletId: string; // creator's wallet receiving the sale
  creatorProfileId: string;
  type: Extract<LedgerEventType, "SUBSCRIPTION" | "PPV" | "TIP" | "MESSAGE">;
  grossAmountUsd: number;
  paymentFeeUsd?: number;
  referenceType: string;
  referenceId: string;
  description?: string;
}

/**
 * Posts a gross sale event, splitting it into creator/platform shares
 * using the CURRENT platform revenue-share setting. The split is frozen on
 * the entry at write time — later changes to CREATOR_SHARE do not
 * retroactively alter historical entries.
 */
export async function postRevenueEvent(input: RevenueEventInput) {
  const config = await getBusinessConfig();
  const creatorShareAmount = roundCents(input.grossAmountUsd * config.creatorShare);
  const platformShareAmount = roundCents(input.grossAmountUsd * config.platformShare);

  return db.ledgerEntry.create({
    data: {
      walletId: input.walletId,
      creatorProfileId: input.creatorProfileId,
      type: input.type,
      grossAmount: new Prisma.Decimal(input.grossAmountUsd),
      currency: "USD",
      creatorShareAmount: new Prisma.Decimal(creatorShareAmount),
      platformShareAmount: new Prisma.Decimal(platformShareAmount),
      paymentFeeAmount: input.paymentFeeUsd != null ? new Prisma.Decimal(input.paymentFeeUsd) : null,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
    },
  });
}

export interface UnlimitedAllocationEventInput {
  walletId: string;
  creatorProfileId: string;
  amountUsd: number;
  periodStart: Date;
  periodEnd: Date;
}

export async function postUnlimitedAllocationEvent(input: UnlimitedAllocationEventInput) {
  return db.ledgerEntry.create({
    data: {
      walletId: input.walletId,
      creatorProfileId: input.creatorProfileId,
      type: "UNLIMITED_ALLOCATION",
      grossAmount: new Prisma.Decimal(input.amountUsd),
      currency: "USD",
      creatorShareAmount: new Prisma.Decimal(input.amountUsd), // pool allocation IS the creator's amount
      platformShareAmount: new Prisma.Decimal(0),
      referenceType: "unlimited_period",
      referenceId: `${input.periodStart.toISOString()}_${input.periodEnd.toISOString()}`,
      description: `Unlimited pool allocation for period ${input.periodStart.toISOString()} – ${input.periodEnd.toISOString()}`,
    },
  });
}

export interface ReversalEventInput {
  walletId: string;
  creatorProfileId?: string;
  type: Extract<LedgerEventType, "REFUND" | "CHARGEBACK" | "PAYOUT_REVERSAL" | "ADJUSTMENT">;
  amountUsd: number; // positive number; sign handled by type semantics downstream
  referenceType: string;
  referenceId: string;
  description?: string;
}

export async function postReversalEvent(input: ReversalEventInput) {
  return db.ledgerEntry.create({
    data: {
      walletId: input.walletId,
      creatorProfileId: input.creatorProfileId,
      type: input.type,
      grossAmount: new Prisma.Decimal(-Math.abs(input.amountUsd)),
      currency: "USD",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
    },
  });
}

export interface PayoutEventInput {
  walletId: string;
  payoutId: string;
  amountUsd: number;
}

export async function postPayoutEvent(input: PayoutEventInput) {
  return db.ledgerEntry.create({
    data: {
      walletId: input.walletId,
      type: "PAYOUT",
      grossAmount: new Prisma.Decimal(-Math.abs(input.amountUsd)),
      currency: "USD",
      referenceType: "payout",
      referenceId: input.payoutId,
    },
  });
}

/**
 * Recomputes a wallet's pending/available/paid balances purely from its
 * LedgerEntry history and writes the result to the Wallet cache fields.
 * This is the ONLY function permitted to write Wallet.cached*Balance.
 *
 * Simplified settlement rule for Sprint 0: entries newer than the
 * settlement window are "pending"; older, non-reversed entries are
 * "available"; PAYOUT entries reduce available balance and accumulate
 * into paid balance. This will be refined in Sprint 7 (Operations) once
 * real processor settlement timing is known.
 */
export async function recomputeWalletBalances(walletId: string, settlementDelayDays = 3) {
  const entries = await db.ledgerEntry.findMany({ where: { walletId } });
  const settlementCutoff = new Date(Date.now() - settlementDelayDays * 24 * 60 * 60 * 1000);

  let pending = 0;
  let available = 0;
  let paid = 0;

  for (const entry of entries) {
    const amount =
      entry.type === "UNLIMITED_ALLOCATION"
        ? Number(entry.creatorShareAmount ?? entry.grossAmount)
        : entry.creatorShareAmount != null
          ? Number(entry.creatorShareAmount)
          : Number(entry.grossAmount);

    if (entry.type === "PAYOUT") {
      paid += Math.abs(amount);
      available += amount; // amount is negative for payouts
      continue;
    }

    if (entry.createdAt > settlementCutoff) {
      pending += amount;
    } else {
      available += amount;
    }
  }

  const rounded = {
    pending: roundCents(pending),
    available: roundCents(available),
    paid: roundCents(paid),
  };

  await db.wallet.update({
    where: { id: walletId },
    data: {
      cachedPendingBalanceUsd: new Prisma.Decimal(rounded.pending),
      cachedAvailableBalanceUsd: new Prisma.Decimal(rounded.available),
      cachedPaidBalanceUsd: new Prisma.Decimal(rounded.paid),
      balanceRecomputedAt: new Date(),
    },
  });

  return rounded;
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
