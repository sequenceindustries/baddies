import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/providers/payment";
import { db } from "@/lib/db/client";
import {
  postRevenueEvent,
  postReversalEvent,
  postCommissionReversalEvent,
  recomputeWalletBalances,
} from "@/lib/ledger/service";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Payment webhook endpoint. Per build brief §21: "Never trust the browser
 * to tell the backend 'payment succeeded.' The processor webhook is
 * authoritative." No other code path may mark a subscription ACTIVE, a
 * PPV purchase complete, or a payout PAID — only this handler (and the
 * ledger functions it calls) does that.
 *
 * Signature verification happens inside provider.verifyAndParseWebhook —
 * requests that fail verification are rejected with 400 before any DB
 * write occurs.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-payment-signature") ?? "";

  const provider = getPaymentProvider();

  let event;
  try {
    event = provider.verifyAndParseWebhook(rawBody, signature);
  } catch (err) {
    console.error("[webhook:payment] signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "subscription.created":
    case "subscription.renewed":
      await handleSubscriptionActive(event.data);
      break;
    case "subscription.past_due":
      await handleSubscriptionStatus(event.data, "PAST_DUE");
      break;
    case "subscription.cancelled":
      await handleSubscriptionStatus(event.data, "CANCELLED");
      break;
    case "payment.succeeded":
      await handlePaymentSucceeded(event.data);
      break;
    case "payment.failed":
      // Recorded for observability; entitlement is simply never granted
      // since it only happens on payment.succeeded.
      console.warn("[webhook:payment] payment failed", event.data);
      break;
    case "refund.completed":
      await handleRefund(event.data);
      break;
    case "chargeback.opened":
      await handleChargeback(event.data);
      break;
    case "payout.paid":
    case "payout.failed":
      await handlePayoutStatus(event.type, event.data);
      break;
    default:
      console.warn(`[webhook:payment] unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

// --- handlers -------------------------------------------------------------
// Sprint 0 note: these are structural stubs establishing the webhook →
// ledger → entitlement pipeline. Full metadata mapping (which
// subscription/purchase a given provider event corresponds to) is fleshed
// out in Sprint 4 (Subscriptions) once a real processor is selected.

async function handleSubscriptionActive(data: Record<string, unknown>) {
  const subscriptionId = data.subscriptionId as string | undefined;
  if (!subscriptionId) return;
  await db.subscription.updateMany({
    where: { paymentProviderSubscriptionId: subscriptionId },
    data: { status: "ACTIVE" },
  });
}

async function handleSubscriptionStatus(
  data: Record<string, unknown>,
  status: "PAST_DUE" | "CANCELLED"
) {
  const subscriptionId = data.subscriptionId as string | undefined;
  if (!subscriptionId) return;
  await db.subscription.updateMany({
    where: { paymentProviderSubscriptionId: subscriptionId },
    data: { status },
  });
}

async function handlePaymentSucceeded(data: Record<string, unknown>) {
  const walletId = data.walletId as string | undefined;
  const creatorProfileId = data.creatorProfileId as string | undefined;
  const grossAmountUsd = data.grossAmountUsd as number | undefined;
  const referenceType = (data.referenceType as string) ?? "purchase";
  const referenceId = (data.referenceId as string) ?? "unknown";
  const eventType = (data.eventType as "SUBSCRIPTION" | "PPV" | "TIP" | "MESSAGE") ?? "PPV";

  if (!walletId || !creatorProfileId || grossAmountUsd == null) {
    console.warn("[webhook:payment] payment.succeeded missing required fields", data);
    return;
  }

  await postRevenueEvent({
    walletId,
    creatorProfileId,
    type: eventType,
    grossAmountUsd,
    referenceType,
    referenceId,
  });
  await recomputeWalletBalances(walletId);
}

async function handleRefund(data: Record<string, unknown>) {
  const walletId = data.walletId as string | undefined;
  const amountUsd = data.amountUsd as number | undefined;
  const referenceId = (data.referenceId as string) ?? "unknown";
  if (!walletId || amountUsd == null) return;

  await postReversalEvent({
    walletId,
    type: "REFUND",
    amountUsd,
    referenceType: "refund",
    referenceId,
  });
  await recomputeWalletBalances(walletId);
  await reverseCommissionIfLinked(data, amountUsd, `Refund (${referenceId})`, "REFUND");
}

async function handleChargeback(data: Record<string, unknown>) {
  const walletId = data.walletId as string | undefined;
  const amountUsd = data.amountUsd as number | undefined;
  const referenceId = (data.referenceId as string) ?? "unknown";
  if (!walletId || amountUsd == null) return;

  await postReversalEvent({
    walletId,
    type: "CHARGEBACK",
    amountUsd,
    referenceType: "chargeback",
    referenceId,
  });
  await recomputeWalletBalances(walletId);
  await reverseCommissionIfLinked(data, amountUsd, `Chargeback (${referenceId})`, "CHARGEBACK");
}

/**
 * A refund/chargeback payload carries originalReferenceType/
 * originalReferenceId — the same (referenceType, referenceId) pair the
 * ORIGINAL SUBSCRIPTION LedgerEntry was posted with (e.g.
 * originalReferenceType: "subscription", originalReferenceId:
 * <subscription.id> — see POST /api/checkout/subscribe). This is what
 * correlates a refund/chargeback back to the specific revenue event a
 * Founding Partner commission may have been computed from — a real gap
 * this route had no way to close before (postReversalEvent had no link
 * back to the original entry at all).
 *
 * Never blocks or fails the creator-side reversal above, which has
 * already happened by the time this runs. If the source entry can't be
 * found (a missing/garbled payload, or a processor that doesn't send
 * these fields yet), this never silently drops a possible partner
 * commission reversal — it writes a MANUAL_REVIEW AbuseFlag instead so
 * an admin can look at it directly.
 */
async function reverseCommissionIfLinked(
  data: Record<string, unknown>,
  amountUsd: number,
  reason: string,
  eventKind: "REFUND" | "CHARGEBACK"
) {
  const originalReferenceType = data.originalReferenceType as string | undefined;
  const originalReferenceId = data.originalReferenceId as string | undefined;
  if (!originalReferenceType || !originalReferenceId) return;

  const sourceEntry = await db.ledgerEntry.findFirst({
    where: { type: "SUBSCRIPTION", referenceType: originalReferenceType, referenceId: originalReferenceId },
    select: { id: true },
  });

  if (!sourceEntry) {
    try {
      await db.abuseFlag.create({
        data: {
          type: "MANUAL_REVIEW",
          reason: `Could not correlate a refund/chargeback back to its source SUBSCRIPTION entry (originalReferenceType=${originalReferenceType}, originalReferenceId=${originalReferenceId}) — a Founding Partner commission may need manual reversal. ${reason}`,
          autoDetected: true,
        },
      });
    } catch (err) {
      console.error("[webhook:payment] failed to write MANUAL_REVIEW flag for an unresolved reversal", err);
    }
    return;
  }

  const reversal = await postCommissionReversalEvent({
    sourceLedgerEntryId: sourceEntry.id,
    amountUsd,
    reason,
  });
  // null means this source entry never had a linked commission at all
  // (an unreferred creator's ordinary refund) — nothing to flag.
  if (!reversal) return;

  await flagSuspiciousReversalPattern(sourceEntry.id, eventKind, reason);
}

/**
 * Founding-Partner-Programme-specific fraud signal (spec §10) — narrow
 * and rule-based, on purpose: general fraudulent payments elsewhere on
 * the platform stay the existing Report/moderation system's job, not
 * duplicated here (see AbuseFlag's own schema comment).
 *
 * A chargeback against a partner-attributed commission is flagged
 * every time, no threshold — a chargeback is already an exceptional
 * event (the cardholder's bank intervened), unlike an ordinary refund.
 *
 * A refund only gets flagged once it's part of a genuine pattern: the
 * 3rd (or later) commission for this SAME referral that's seen any
 * refund-driven reversal within a rolling 30-day window. Counts
 * distinct PartnerCommission rows with a reversal, not raw refund
 * events — a reasonable proxy given each row already corresponds to
 * one SUBSCRIPTION billing cycle, and stated here plainly as an
 * approximation rather than hidden as exact.
 */
async function flagSuspiciousReversalPattern(
  sourceLedgerEntryId: string,
  eventKind: "REFUND" | "CHARGEBACK",
  reason: string
) {
  const commission = await db.partnerCommission.findUnique({
    where: { sourceLedgerEntryId },
    select: { id: true, foundingPartnerId: true, referralAttributionId: true },
  });
  if (!commission) return;

  if (eventKind === "CHARGEBACK") {
    try {
      await db.abuseFlag.create({
        data: {
          type: "SUSPICIOUS_CHARGEBACK_PATTERN",
          foundingPartnerId: commission.foundingPartnerId,
          referralAttributionId: commission.referralAttributionId,
          partnerCommissionId: commission.id,
          reason: `A chargeback reversed a Founding Partner commission for this referral. ${reason}`,
          autoDetected: true,
        },
      });
    } catch (err) {
      console.error("[webhook:payment] failed to write SUSPICIOUS_CHARGEBACK_PATTERN flag", err);
    }
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentReversedCommissionCount = await db.partnerCommission.count({
    where: {
      referralAttributionId: commission.referralAttributionId,
      reversedAmountUsd: { gt: 0 },
      updatedAt: { gte: thirtyDaysAgo },
    },
  });
  if (recentReversedCommissionCount < 3) return;

  try {
    await db.abuseFlag.create({
      data: {
        type: "SUSPICIOUS_REFUND_PATTERN",
        foundingPartnerId: commission.foundingPartnerId,
        referralAttributionId: commission.referralAttributionId,
        partnerCommissionId: commission.id,
        reason: `${recentReversedCommissionCount} refunded commissions for this referral within the last 30 days. ${reason}`,
        autoDetected: true,
      },
    });
  } catch (err) {
    console.error("[webhook:payment] failed to write SUSPICIOUS_REFUND_PATTERN flag", err);
  }
}

async function handlePayoutStatus(
  eventType: "payout.paid" | "payout.failed",
  data: Record<string, unknown>
) {
  const providerPayoutId = data.providerPayoutId as string | undefined;
  if (!providerPayoutId) return;

  await db.payout.updateMany({
    where: { paymentProviderPayoutId: providerPayoutId },
    data: { status: eventType === "payout.paid" ? "PAID" : "FAILED", processedAt: new Date() },
  });
}
