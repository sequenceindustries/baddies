import { db } from "@/lib/db/client";
import { resolveCreatorRevenueShare, getCurrentRevenueShareRule } from "@/lib/config/revenue-rules";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";
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
 * using the CURRENT revenue-share rule (STANDARD_CREATOR_SHARE, 80% —
 * flat for every creator, referred or not, as of Founding Partner
 * Programme v2). The resolved rule id and any crediting partner are
 * frozen onto the entry at write time — later rule changes, or a later
 * attribution correction, never retroactively alter historical entries.
 *
 * When this is a SUBSCRIPTION event for a creator attributed to a
 * Founding Partner, this also computes and posts that partner's 10%
 * commission (see maybePostPartnerCommission below) in the same
 * transaction as the creator's own entry — the partner's own wallet
 * balance is then recomputed against the partner-specific hold window
 * (config PARTNER_COMMISSION_HOLD_DAYS), separately from the creator's
 * own wallet recompute the caller still performs itself.
 *
 * Replaces the old flat, unversioned PlatformSetting CREATOR_SHARE/
 * PLATFORM_SHARE pair as the source of the SPLIT itself — getBusinessConfig()
 * is still the right place for everything else it holds (pricing, the
 * VIP-pass allocation model), just no longer for this one value, which
 * genuinely needed version history a mutate-in-place setting can't provide.
 */
export async function postRevenueEvent(input: RevenueEventInput) {
  const { rule, foundingPartnerId, referralAttributionId } = await resolveCreatorRevenueShare(
    input.creatorProfileId
  );
  const creatorSharePct = Number(rule.percentage);
  const creatorShareAmount = roundCents(input.grossAmountUsd * creatorSharePct);
  const platformShareAmount = roundCents(input.grossAmountUsd * (1 - creatorSharePct));

  const { entry, partnerWalletId } = await db.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: input.walletId,
        creatorProfileId: input.creatorProfileId,
        type: input.type,
        grossAmount: new Prisma.Decimal(input.grossAmountUsd),
        currency: "USD",
        creatorShareAmount: new Prisma.Decimal(creatorShareAmount),
        platformShareAmount: new Prisma.Decimal(platformShareAmount),
        paymentFeeAmount: input.paymentFeeUsd != null ? new Prisma.Decimal(input.paymentFeeUsd) : null,
        revenueShareRuleId: rule.id,
        foundingPartnerId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
      },
    });

    let partnerWalletId: string | null = null;
    if (input.type === "SUBSCRIPTION" && foundingPartnerId && referralAttributionId) {
      partnerWalletId = await maybePostPartnerCommission(tx, {
        foundingPartnerId,
        referralAttributionId,
        sourceLedgerEntryId: entry.id,
        grossAmountUsd: input.grossAmountUsd,
        paymentFeeUsd: input.paymentFeeUsd,
      });
    }

    return { entry, partnerWalletId };
  });

  if (partnerWalletId) {
    await recomputeWalletBalances(partnerWalletId, await getPartnerCommissionHoldDays());
  }

  return entry;
}

/**
 * "Activation" for a referral's 12-month earning period is defined here,
 * and only here: the first real SUBSCRIPTION revenue event posted for
 * the referred creator — never an application/admin-status date, which
 * could drift from real money actually moving (see this project's plan
 * for the full reasoning). Sets ReferralAttribution.earningPeriodStartAt/
 * EndAt lazily and idempotently the first time this runs for a given
 * attribution; every later call just reads the period already set.
 *
 * Computes and posts the partner's commission (net eligible revenue x
 * PARTNER_COMMISSION_RATE) as a real PARTNER_COMMISSION LedgerEntry
 * against the partner's own wallet — mirroring
 * postUnlimitedAllocationEvent's "creatorShareAmount IS the amount"
 * pattern so recomputeWalletBalances picks it up with no special-casing
 * — plus the matching PartnerCommission row that ties it back to the
 * source entry and the resolved rule version. Once the referral's own
 * 12-month period has expired, this still lets the creator's own entry
 * through untouched (foundingPartnerId is already stamped there for
 * reporting) but posts no further commission.
 *
 * Returns the partner's walletId when a commission was posted (so the
 * caller knows to recompute that wallet's balance too), or null
 * otherwise — including the ordinary case of "not a referred creator,"
 * which never reaches this function at all.
 */
async function maybePostPartnerCommission(
  tx: Prisma.TransactionClient,
  args: {
    foundingPartnerId: string;
    referralAttributionId: string;
    sourceLedgerEntryId: string;
    grossAmountUsd: number;
    paymentFeeUsd?: number;
  }
): Promise<string | null> {
  const attribution = await tx.referralAttribution.findUnique({
    where: { id: args.referralAttributionId },
    select: { earningPeriodStartAt: true, earningPeriodEndAt: true },
  });
  if (!attribution) return null; // shouldn't happen, but never block the creator's own entry over it

  const now = new Date();
  let periodStart = attribution.earningPeriodStartAt;
  let periodEnd = attribution.earningPeriodEndAt;

  if (!periodStart) {
    periodStart = now;
    periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    await tx.referralAttribution.update({
      where: { id: args.referralAttributionId },
      data: { earningPeriodStartAt: periodStart, earningPeriodEndAt: periodEnd },
    });
  }

  if (!periodEnd || now > periodEnd) return null; // period expired — no further commission

  const commissionRule = await getCurrentRevenueShareRule("PARTNER_COMMISSION_RATE");
  const commissionPct = Number(commissionRule.percentage);
  const netEligibleAmountUsd = roundCents(args.grossAmountUsd - (args.paymentFeeUsd ?? 0));
  const commissionAmountUsd = roundCents(netEligibleAmountUsd * commissionPct);
  if (commissionAmountUsd <= 0) return null; // a fully fee-consumed event earns nothing

  const partner = await tx.foundingPartner.findUnique({
    where: { id: args.foundingPartnerId },
    select: { user: { select: { wallet: { select: { id: true } } } } },
  });
  const partnerWalletId = partner?.user.wallet?.id;
  // Shouldn't happen (every Founding Partner gets a Wallet at
  // accept-time) but never block the creator's own entry over it.
  if (!partnerWalletId) return null;

  const payoutEntry = await tx.ledgerEntry.create({
    data: {
      walletId: partnerWalletId,
      type: "PARTNER_COMMISSION",
      grossAmount: new Prisma.Decimal(commissionAmountUsd),
      currency: "USD",
      // The amount THIS wallet receives — see recomputeWalletBalances's
      // "creatorShareAmount IS the amount" fallback for non-null values.
      creatorShareAmount: new Prisma.Decimal(commissionAmountUsd),
      platformShareAmount: new Prisma.Decimal(0),
      revenueShareRuleId: commissionRule.id,
      foundingPartnerId: args.foundingPartnerId,
      referenceType: "partner_commission",
      referenceId: args.sourceLedgerEntryId,
      description: "Founding Partner commission on a referred creator's subscription revenue",
    },
  });

  await tx.partnerCommission.create({
    data: {
      foundingPartnerId: args.foundingPartnerId,
      referralAttributionId: args.referralAttributionId,
      sourceLedgerEntryId: args.sourceLedgerEntryId,
      revenueShareRuleId: commissionRule.id,
      netEligibleAmountUsd: new Prisma.Decimal(netEligibleAmountUsd),
      commissionAmountUsd: new Prisma.Decimal(commissionAmountUsd),
      payoutLedgerEntryId: payoutEntry.id,
    },
  });

  return partnerWalletId;
}

async function getPartnerCommissionHoldDays(): Promise<number> {
  const raw = await getPlatformSetting(BUSINESS_CONFIG_KEYS.PARTNER_COMMISSION_HOLD_DAYS);
  const days = Number(raw);
  return Number.isFinite(days) && days >= 0 ? days : 30;
}

export interface CommissionReversalInput {
  // The SUBSCRIPTION LedgerEntry the original commission was computed
  // from (PartnerCommission.sourceLedgerEntryId) — see the payment
  // webhook route for how a refund/chargeback payload resolves this.
  sourceLedgerEntryId: string;
  // The refund/chargeback amount being reversed, positive, in the same
  // currency/units as the original grossAmountUsd.
  amountUsd: number;
  reason: string;
}

/**
 * Reverses some or all of a Founding Partner's commission on a
 * SUBSCRIPTION event that was later refunded or charged back —
 * proportional to how much of the original gross amount is being
 * reversed (a partial refund only claws back a partial commission),
 * capped at whatever commission remains outstanding so this can never
 * reverse more than was actually credited. Posts a real, negative
 * PARTNER_COMMISSION_REVERSAL LedgerEntry (same "never edit, only post
 * a correcting entry" discipline as postReversalEvent) and flips the
 * PartnerCommission to REVERSED once fully unwound.
 *
 * A no-op (returns null) when the source entry never produced a
 * commission in the first place (an unreferred creator's refund, or a
 * referral outside its earning period) — most refunds/chargebacks
 * never reach this function's actual reversal logic at all.
 */
export async function postCommissionReversalEvent(input: CommissionReversalInput) {
  const commission = await db.partnerCommission.findUnique({
    where: { sourceLedgerEntryId: input.sourceLedgerEntryId },
    include: {
      sourceLedgerEntry: { select: { grossAmount: true } },
      foundingPartner: { select: { user: { select: { wallet: { select: { id: true } } } } } },
    },
  });
  if (!commission || commission.status === "REVERSED") return null;

  const originalGrossUsd = Number(commission.sourceLedgerEntry.grossAmount);
  const remainingCommissionUsd = roundCents(Number(commission.commissionAmountUsd) - Number(commission.reversedAmountUsd));
  if (remainingCommissionUsd <= 0) return null;

  const proportionalShareUsd =
    originalGrossUsd > 0
      ? roundCents(Number(commission.commissionAmountUsd) * (Math.abs(input.amountUsd) / originalGrossUsd))
      : remainingCommissionUsd;
  const reversalAmountUsd = Math.min(remainingCommissionUsd, proportionalShareUsd);
  if (reversalAmountUsd <= 0) return null;

  const partnerWalletId = commission.foundingPartner.user.wallet?.id;
  if (!partnerWalletId) return null; // shouldn't happen — see maybePostPartnerCommission's own comment

  const newReversedTotal = roundCents(Number(commission.reversedAmountUsd) + reversalAmountUsd);
  // Tolerate float/rounding dust rather than requiring an exact match.
  const nowFullyReversed = newReversedTotal >= Number(commission.commissionAmountUsd) - 0.005;

  const reversalEntry = await db.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: partnerWalletId,
        type: "PARTNER_COMMISSION_REVERSAL",
        grossAmount: new Prisma.Decimal(-Math.abs(reversalAmountUsd)),
        currency: "USD",
        foundingPartnerId: commission.foundingPartnerId,
        referenceType: "partner_commission_reversal",
        referenceId: commission.id,
        description: input.reason,
      },
    });
    await tx.partnerCommission.update({
      where: { id: commission.id },
      data: {
        reversedAmountUsd: new Prisma.Decimal(newReversedTotal),
        // A partial reversal leaves the commission's current status
        // (PENDING or HELD) untouched — only full reversal is terminal.
        status: nowFullyReversed ? "REVERSED" : commission.status,
        reversedAt: nowFullyReversed ? new Date() : commission.reversedAt,
        reversalReason: input.reason,
      },
    });
    return entry;
  });

  await recomputeWalletBalances(partnerWalletId, await getPartnerCommissionHoldDays());

  return reversalEntry;
}

export interface ManualCommissionReversalInput {
  commissionId: string;
  // Defaults to the full remaining balance when omitted — this is the
  // common case ("reverse this fraudulent commission"). A partial
  // amount is still supported for a dispute that's only partly upheld.
  amountUsd?: number;
  reason: string;
}

/**
 * A direct admin action ("reverse this commission by $X, this looks
 * fraudulent") — not a refund/chargeback correlation (see
 * postCommissionReversalEvent above for that path, which instead
 * reverses PROPORTIONALLY to a real refund amount against the
 * original gross). Capped at whatever remains outstanding either way —
 * this can never reverse more than was actually credited, and can
 * never turn a reversal into a payment the other direction.
 */
export async function postManualCommissionReversal(input: ManualCommissionReversalInput) {
  const commission = await db.partnerCommission.findUnique({
    where: { id: input.commissionId },
    include: { foundingPartner: { select: { user: { select: { wallet: { select: { id: true } } } } } } },
  });
  if (!commission || commission.status === "REVERSED") return null;

  const remainingCommissionUsd = roundCents(Number(commission.commissionAmountUsd) - Number(commission.reversedAmountUsd));
  if (remainingCommissionUsd <= 0) return null;

  const requestedUsd = input.amountUsd != null ? Math.abs(input.amountUsd) : remainingCommissionUsd;
  const reversalAmountUsd = Math.min(remainingCommissionUsd, requestedUsd);
  if (reversalAmountUsd <= 0) return null;

  const partnerWalletId = commission.foundingPartner.user.wallet?.id;
  if (!partnerWalletId) return null; // shouldn't happen — see maybePostPartnerCommission's own comment

  const newReversedTotal = roundCents(Number(commission.reversedAmountUsd) + reversalAmountUsd);
  const nowFullyReversed = newReversedTotal >= Number(commission.commissionAmountUsd) - 0.005;

  const reversalEntry = await db.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: partnerWalletId,
        type: "PARTNER_COMMISSION_REVERSAL",
        grossAmount: new Prisma.Decimal(-Math.abs(reversalAmountUsd)),
        currency: "USD",
        foundingPartnerId: commission.foundingPartnerId,
        referenceType: "partner_commission_reversal",
        referenceId: commission.id,
        description: input.reason,
      },
    });
    await tx.partnerCommission.update({
      where: { id: commission.id },
      data: {
        reversedAmountUsd: new Prisma.Decimal(newReversedTotal),
        status: nowFullyReversed ? "REVERSED" : commission.status,
        reversedAt: nowFullyReversed ? new Date() : commission.reversedAt,
        reversalReason: input.reason,
      },
    });
    return entry;
  });

  await recomputeWalletBalances(partnerWalletId, await getPartnerCommissionHoldDays());

  return reversalEntry;
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
