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
  // Progressive earnings accrual (monetisation redesign) — set only for
  // a SUBSCRIPTION event covering a multi-month prepaid package.
  // recognitionStartAt is when the creator starts "earning" month 1 of
  // this specific package (purchase time for a new/immediate-renewal
  // subscription; the OLD period's currentPeriodEnd for a renewal
  // purchased ahead of expiry — see the webhook handler). durationMonths
  // is the package length (1/3/6/12). Both omitted (or durationMonths
  // <= 1) recognizes the full amount immediately, identical to
  // pre-redesign behavior — see recomputeWalletBalances's own comment
  // for the exact installment formula.
  recognitionStartAt?: Date;
  durationMonths?: number;
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
        recognitionStartAt: input.recognitionStartAt ?? null,
        durationMonths: input.durationMonths ?? null,
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

// A "month" for recognition purposes is a fixed 30 days — matches this
// app's own existing currentPeriodEnd math (checkout routes have always
// computed "1 month" as 30 * 24 * 60 * 60 * 1000, never a calendar
// month), so a 1-month package's period length and its recognition
// schedule agree exactly.
const RECOGNITION_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface RecognitionSourceEntry {
  creatorShareAmount: Prisma.Decimal | null;
  grossAmount: Prisma.Decimal;
  durationMonths: number | null;
  recognitionStartAt: Date | null;
  createdAt: Date;
}

/**
 * Progressive earnings accrual — the core formula. Splits a SUBSCRIPTION
 * entry's creatorShareAmount into `durationMonths` equal installments
 * (the last installment absorbs any rounding remainder) and recognizes
 * installment i once `now >= recognitionStartAt + i months` — i.e.
 * installment 0 recognizes immediately (the creator has already started
 * serving month 1), installment 1 a month later, and so on. A
 * `durationMonths` of 1 (or unset — every non-subscription/legacy entry)
 * degenerates to recognizing the full amount immediately, identical to
 * this app's original pre-redesign behavior.
 *
 * Of the recognized amount, the existing settlement-delay fraud/
 * chargeback hold still applies — but per-installment, keyed off each
 * installment's OWN recognition date, not the entry's createdAt. The
 * unrecognized remainder is neither pending nor available: it's
 * `scheduled` (future/unearned), Wallet's 4th cached bucket — folded
 * into the dashboard's displayed "Pending" figure alongside the fraud-
 * hold pending amount, per direct product decision, but computed
 * separately here for auditability.
 *
 * Non-clawback by construction: postSubscriptionReversalEvent (below)
 * calls this to find exactly how much is still unrecognized as of NOW
 * and can only ever reverse that portion — an already-recognized
 * (pending or available) amount is mathematically excluded from ever
 * being reversed, not merely policy-guarded.
 */
export function computeSubscriptionRecognition(
  entry: RecognitionSourceEntry,
  now: Date,
  settlementCutoff: Date
): { recognizedAmount: number; scheduledAmount: number; pendingAmount: number; availableAmount: number } {
  const totalAmount = Number(entry.creatorShareAmount ?? entry.grossAmount);
  const durationMonths = entry.durationMonths && entry.durationMonths > 0 ? entry.durationMonths : 1;
  const recognitionStart = entry.recognitionStartAt ?? entry.createdAt;
  const installmentBase = Math.floor((totalAmount / durationMonths) * 100) / 100;

  let recognizedMonths = 0;
  for (let i = 0; i < durationMonths; i++) {
    const installmentStart = recognitionStart.getTime() + i * RECOGNITION_MONTH_MS;
    if (now.getTime() >= installmentStart) {
      recognizedMonths = i + 1;
    } else {
      break;
    }
  }

  const fullyRecognized = recognizedMonths >= durationMonths;
  const recognizedAmount = fullyRecognized ? totalAmount : roundCents(installmentBase * recognizedMonths);
  const scheduledAmount = roundCents(totalAmount - recognizedAmount);

  let pendingAmount = 0;
  let availableAmount = 0;
  for (let i = 0; i < recognizedMonths; i++) {
    const installmentStart = recognitionStart.getTime() + i * RECOGNITION_MONTH_MS;
    // Only the LAST installment of a fully-recognized entry absorbs the
    // rounding remainder — every earlier installment (and every
    // installment of a not-yet-fully-recognized entry) is exactly
    // installmentBase.
    const amount =
      fullyRecognized && i === durationMonths - 1
        ? roundCents(totalAmount - installmentBase * (durationMonths - 1))
        : installmentBase;
    if (installmentStart > settlementCutoff.getTime()) {
      pendingAmount += amount;
    } else {
      availableAmount += amount;
    }
  }

  return {
    recognizedAmount,
    scheduledAmount,
    pendingAmount: roundCents(pendingAmount),
    availableAmount: roundCents(availableAmount),
  };
}

/**
 * Recomputes a wallet's pending/available/paid/scheduled balances
 * purely from its LedgerEntry history and writes the result to the
 * Wallet cache fields. This is the ONLY function permitted to write
 * Wallet.cached*Balance.
 *
 * Settlement rule: entries newer than the settlement window are
 * "pending"; older, non-reversed entries are "available"; PAYOUT
 * entries reduce available balance and accumulate into paid balance.
 * A SUBSCRIPTION entry tagged with durationMonths (monetisation
 * redesign) instead runs through computeSubscriptionRecognition above,
 * so only the already-recognized portion of a multi-month package
 * counts toward pending/available at all — the rest sits in the new
 * `scheduled` bucket until its own installment date arrives.
 */
export async function recomputeWalletBalances(walletId: string, settlementDelayDays = 3) {
  const entries = await db.ledgerEntry.findMany({ where: { walletId } });
  const now = new Date();
  const settlementCutoff = new Date(now.getTime() - settlementDelayDays * 24 * 60 * 60 * 1000);

  let pending = 0;
  let available = 0;
  let paid = 0;
  let scheduled = 0;

  for (const entry of entries) {
    if (entry.type === "PAYOUT") {
      const amount = Number(entry.creatorShareAmount ?? entry.grossAmount);
      paid += Math.abs(amount);
      available += amount; // amount is negative for payouts
      continue;
    }

    if (entry.durationMonths != null) {
      const { pendingAmount, availableAmount, scheduledAmount } = computeSubscriptionRecognition(
        entry,
        now,
        settlementCutoff
      );
      pending += pendingAmount;
      available += availableAmount;
      scheduled += scheduledAmount;
      continue;
    }

    const amount =
      entry.type === "UNLIMITED_ALLOCATION"
        ? Number(entry.creatorShareAmount ?? entry.grossAmount)
        : entry.creatorShareAmount != null
          ? Number(entry.creatorShareAmount)
          : Number(entry.grossAmount);

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
    scheduled: roundCents(scheduled),
  };

  await db.wallet.update({
    where: { id: walletId },
    data: {
      cachedPendingBalanceUsd: new Prisma.Decimal(rounded.pending),
      cachedAvailableBalanceUsd: new Prisma.Decimal(rounded.available),
      cachedPaidBalanceUsd: new Prisma.Decimal(rounded.paid),
      cachedScheduledBalanceUsd: new Prisma.Decimal(rounded.scheduled),
      balanceRecomputedAt: new Date(),
    },
  });

  return rounded;
}

export interface SubscriptionReversalInput {
  sourceLedgerEntryId: string; // the original SUBSCRIPTION LedgerEntry this refund/chargeback is against
  requestedAmountUsd: number; // the refund/chargeback amount requested, positive
  type: Extract<LedgerEventType, "REFUND" | "CHARGEBACK">;
  referenceType: string;
  referenceId: string;
  description?: string;
}

/**
 * Reverses a refund/chargeback against a multi-month SUBSCRIPTION
 * entry WITHOUT ever clawing back money already recognized (pending or
 * available) — the non-clawback requirement enforced by construction,
 * not a policy check that could be bypassed. Computes exactly how much
 * of the source entry is still unrecognized as of right now
 * (computeSubscriptionRecognition) and reverses only
 * min(requestedAmountUsd, unrecognizedAmount). A source entry that's
 * already fully recognized (e.g. a 1-month package, or a multi-month
 * package whose period has fully elapsed) returns null — nothing left
 * to reverse this way; an ordinary postReversalEvent is the right call
 * for that case (this function is specifically for the multi-month,
 * partially-unearned case).
 */
export async function postSubscriptionReversalEvent(input: SubscriptionReversalInput) {
  const source = await db.ledgerEntry.findUnique({ where: { id: input.sourceLedgerEntryId } });
  if (!source) return null;

  const now = new Date();
  const { scheduledAmount } = computeSubscriptionRecognition(source, now, now); // settlementCutoff irrelevant here
  const unrecognizedAmount = Math.max(scheduledAmount, 0);
  const reversalAmount = roundCents(Math.min(Math.abs(input.requestedAmountUsd), unrecognizedAmount));
  if (reversalAmount <= 0) return null;

  const entry = await db.ledgerEntry.create({
    data: {
      walletId: source.walletId,
      creatorProfileId: source.creatorProfileId,
      type: input.type,
      grossAmount: new Prisma.Decimal(-reversalAmount),
      currency: "USD",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description:
        input.description ??
        `Reversal of the not-yet-earned portion of subscription entry ${source.id} — already-recognized earnings are never clawed back.`,
    },
  });

  return entry;
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
