import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { db } from "@/lib/db/client";
import {
  postRevenueEvent,
  postReversalEvent,
  postSubscriptionReversalEvent,
  postCommissionReversalEvent,
  recomputeWalletBalances,
} from "@/lib/ledger/service";
import { createNotification } from "@/lib/creator-notifications/create-notification";
import { markTrialConvertedIfActive } from "@/lib/entitlements/trial";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RECOGNITION_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // matches src/lib/ledger/service.ts's own convention

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
 *
 * Idempotency (monetisation redesign): every event is recorded in
 * WebhookEvent, keyed on (provider, providerEventId), BEFORE any
 * processing. A redelivered event whose row already has processedAt set
 * is detected and skipped — never double-activates an entitlement or
 * double-posts a LedgerEntry. A thrown error during processing leaves
 * processedAt null, so a legitimate provider retry still gets applied;
 * only a second delivery of an event already marked fully processed is
 * treated as a true duplicate.
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

  const existing = await db.webhookEvent.findUnique({
    where: { provider_providerEventId: { provider: provider.name, providerEventId: event.providerEventId } },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const webhookEventRow =
    existing ??
    (await db.webhookEvent.create({
      data: {
        provider: provider.name,
        providerEventId: event.providerEventId,
        eventType: event.type,
        payload: event.data as Prisma.InputJsonValue,
      },
    }));

  try {
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
        await handlePaymentFailed(event.data);
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

    await db.webhookEvent.update({ where: { id: webhookEventRow.id }, data: { processedAt: new Date() } });
  } catch (err) {
    console.error("[webhook:payment] processing failed — leaving unprocessed for a legitimate retry", err);
    await db.webhookEvent
      .update({ where: { id: webhookEventRow.id }, data: { processingError: String(err) } })
      .catch(() => {});
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// --- handlers -------------------------------------------------------------

/**
 * The primary activation path for the prepaid-package model (monetisation
 * redesign): resolves the PendingOrder this payment belongs to by
 * providerCheckoutId (never by trusting walletId/creatorProfileId
 * directly in the payload — a real processor doesn't send this app's
 * internal ids natively), verifies the amount/currency actually match
 * what was quoted at checkout, then creates or extends the
 * Subscription/UnlimitedSubscription and — for an Exclusive purchase —
 * posts the progressive-accrual-tagged SUBSCRIPTION ledger entry.
 *
 * Renewal semantics: if the fan already has a subscription whose
 * currentPeriodEnd is still in the future, the new package is appended
 * onto the END of the existing period (recognitionStartAt = the OLD
 * currentPeriodEnd) rather than starting today — buying ahead of
 * expiry never wastes paid time, and the creator doesn't start
 * "earning" the new package until they've actually finished serving
 * the one already paid for.
 */
async function handlePaymentSucceeded(data: Record<string, unknown>) {
  const providerCheckoutId = data.providerCheckoutId as string | undefined;
  const providerPaymentId = data.providerPaymentId as string | undefined;
  const amountUsd = data.amountUsd as number | undefined;
  const currency = (data.currency as string) ?? "USD";

  if (!providerCheckoutId || amountUsd == null) {
    console.warn("[webhook:payment] payment.succeeded missing required fields", data);
    return;
  }

  const order = await db.pendingOrder.findUnique({ where: { providerCheckoutId } });
  if (!order) {
    console.warn(`[webhook:payment] payment.succeeded for unknown providerCheckoutId=${providerCheckoutId}`);
    return;
  }
  if (order.status === "COMPLETED") return; // already activated — WebhookEvent dedup should already prevent reaching here

  const orderAmount = Number(order.amountUsd);
  if (Math.abs(orderAmount - amountUsd) > 0.01 || currency !== order.currency) {
    console.error(
      `[webhook:payment] amount/currency mismatch for order ${order.id}: expected ${orderAmount} ${order.currency}, got ${amountUsd} ${currency}`
    );
    await db.pendingOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
    try {
      await db.abuseFlag.create({
        data: {
          type: "MANUAL_REVIEW",
          reason: `Payment amount/currency mismatch on PendingOrder ${order.id}: expected ${orderAmount} ${order.currency}, got ${amountUsd} ${currency}.`,
          autoDetected: true,
        },
      });
    } catch (err) {
      console.error("[webhook:payment] failed to write MANUAL_REVIEW flag for an amount mismatch", err);
    }
    return;
  }

  const now = new Date();
  const durationMonths = order.durationMonths;
  const periodLengthMs = durationMonths * RECOGNITION_MONTH_MS;

  if (order.orderType === "EXCLUSIVE_SUBSCRIPTION") {
    if (!order.creatorProfileId) {
      console.error(`[webhook:payment] EXCLUSIVE_SUBSCRIPTION order ${order.id} has no creatorProfileId`);
      return;
    }
    const creator = await db.creatorProfile.findUnique({
      where: { id: order.creatorProfileId },
      select: { userId: true },
    });
    if (!creator) {
      console.error(`[webhook:payment] order ${order.id} references a creatorProfileId that no longer exists`);
      await db.pendingOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
      return;
    }

    const existingSub = await db.subscription.findFirst({
      where: { fanId: order.customerId, creatorProfileId: order.creatorProfileId },
    });

    // Renewal bought ahead of expiry extends from the OLD period's end;
    // a lapsed/first-time purchase starts serving from now.
    const servingFrom = existingSub && existingSub.currentPeriodEnd > now ? existingSub.currentPeriodEnd : now;
    const newPeriodEnd = new Date(servingFrom.getTime() + periodLengthMs);

    const subscription = existingSub
      ? await db.subscription.update({
          where: { id: existingSub.id },
          data: {
            status: "ACTIVE",
            cancelledAt: null,
            currentPeriodEnd: newPeriodEnd,
            priceUsdAtPurchase: orderAmount,
            durationMonths,
            paymentProviderSubscriptionId: providerPaymentId,
            renewalReminderSentAt: null,
          },
        })
      : await db.subscription.create({
          data: {
            fanId: order.customerId,
            creatorProfileId: order.creatorProfileId,
            status: "ACTIVE",
            priceUsdAtPurchase: orderAmount,
            durationMonths,
            currentPeriodEnd: newPeriodEnd,
            paymentProviderSubscriptionId: providerPaymentId,
          },
        });

    const creatorWallet = await db.wallet.upsert({
      where: { userId: creator.userId },
      create: { userId: creator.userId },
      update: {},
    });

    await postRevenueEvent({
      walletId: creatorWallet.id,
      creatorProfileId: order.creatorProfileId,
      type: "SUBSCRIPTION",
      grossAmountUsd: orderAmount,
      referenceType: "subscription",
      referenceId: subscription.id,
      description: `Exclusive subscription — ${durationMonths}-month package`,
      recognitionStartAt: servingFrom,
      durationMonths,
    });
    await recomputeWalletBalances(creatorWallet.id);

    await createNotification({
      userId: creator.userId,
      type: "creator.subscribed",
      payload: { actorUserId: order.customerId, creatorProfileId: order.creatorProfileId, subscriptionId: subscription.id },
    });
    await markTrialConvertedIfActive(order.customerId);

    await db.pendingOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED", providerPaymentId, resultingSubscriptionId: subscription.id },
    });
    return;
  }

  // VIP_PASS — deliberately posts no ledger revenue event here; see this
  // route's own module comment and POST /api/checkout/vip-pass's.
  const existingPass = await db.unlimitedSubscription.findFirst({ where: { fanId: order.customerId } });
  const servingFrom = existingPass && existingPass.currentPeriodEnd > now ? existingPass.currentPeriodEnd : now;
  const newPeriodEnd = new Date(servingFrom.getTime() + periodLengthMs);

  const subscription = existingPass
    ? await db.unlimitedSubscription.update({
        where: { id: existingPass.id },
        data: {
          status: "ACTIVE",
          cancelledAt: null,
          currentPeriodEnd: newPeriodEnd,
          priceUsdAtPurchase: orderAmount,
          durationMonths,
          paymentProviderSubscriptionId: providerPaymentId,
          renewalReminderSentAt: null,
        },
      })
    : await db.unlimitedSubscription.create({
        data: {
          fanId: order.customerId,
          status: "ACTIVE",
          priceUsdAtPurchase: orderAmount,
          durationMonths,
          currentPeriodEnd: newPeriodEnd,
          paymentProviderSubscriptionId: providerPaymentId,
        },
      });

  await markTrialConvertedIfActive(order.customerId);

  await db.pendingOrder.update({
    where: { id: order.id },
    data: { status: "COMPLETED", providerPaymentId, resultingSubscriptionId: subscription.id },
  });
}

async function handlePaymentFailed(data: Record<string, unknown>) {
  const providerCheckoutId = data.providerCheckoutId as string | undefined;
  if (!providerCheckoutId) {
    console.warn("[webhook:payment] payment.failed with no providerCheckoutId", data);
    return;
  }
  await db.pendingOrder.updateMany({
    where: { providerCheckoutId, status: { in: ["PENDING", "AWAITING_PAYMENT"] } },
    data: { status: "FAILED" },
  });
}

// --- legacy handlers --------------------------------------------------
// Kept for a future provider that models a true, provider-native
// recurring subscription object rather than the one-time hosted-
// checkout-per-package flow this app's own routes now exclusively use
// (see POST /api/checkout/subscribe's own doc comment on why —
// SOPSPAY and most adult-friendly processors don't offer traditional
// recurring billing at all). Not wired to anything today.

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

async function handleRefund(data: Record<string, unknown>) {
  const walletId = data.walletId as string | undefined;
  const amountUsd = data.amountUsd as number | undefined;
  const referenceId = (data.referenceId as string) ?? "unknown";
  if (!walletId || amountUsd == null) return;

  await postSubscriptionOrPlainReversal(walletId, "REFUND", amountUsd, referenceId);
  await recomputeWalletBalances(walletId);
  await reverseCommissionIfLinked(data, amountUsd, `Refund (${referenceId})`, "REFUND");
}

async function handleChargeback(data: Record<string, unknown>) {
  const walletId = data.walletId as string | undefined;
  const amountUsd = data.amountUsd as number | undefined;
  const referenceId = (data.referenceId as string) ?? "unknown";
  if (!walletId || amountUsd == null) return;

  await postSubscriptionOrPlainReversal(walletId, "CHARGEBACK", amountUsd, referenceId);
  await recomputeWalletBalances(walletId);
  await reverseCommissionIfLinked(data, amountUsd, `Chargeback (${referenceId})`, "CHARGEBACK");
}

/**
 * Routes a refund/chargeback through postSubscriptionReversalEvent
 * (non-clawback-safe — only ever reverses the not-yet-recognized
 * portion of a multi-month package) when the referenced entry is a
 * tagged multi-month SUBSCRIPTION entry, falling back to the plain
 * postReversalEvent for every other case (PPV, tips, a 1-month
 * subscription with nothing left to protect).
 */
async function postSubscriptionOrPlainReversal(
  walletId: string,
  type: "REFUND" | "CHARGEBACK",
  amountUsd: number,
  referenceId: string
) {
  const sourceEntry = await db.ledgerEntry.findFirst({
    where: { type: "SUBSCRIPTION", referenceType: "subscription", referenceId },
    select: { id: true, durationMonths: true },
  });

  if (sourceEntry && sourceEntry.durationMonths != null && sourceEntry.durationMonths > 1) {
    const reversal = await postSubscriptionReversalEvent({
      sourceLedgerEntryId: sourceEntry.id,
      requestedAmountUsd: amountUsd,
      type,
      referenceType: type.toLowerCase(),
      referenceId,
    });
    if (reversal) return;
    // Fully recognized already (period long elapsed) — nothing left to
    // protect; fall through to the plain reversal below so the refund
    // is still recorded on the ledger somehow, for accounting/support
    // visibility, even though it comes entirely out of already-earned
    // money in this edge case (a genuinely late refund on a fully-served
    // package — a business/support decision, not this webhook's to
    // silently swallow).
  }

  await postReversalEvent({ walletId, type, amountUsd, referenceType: type.toLowerCase(), referenceId });
}

/**
 * A refund/chargeback payload carries originalReferenceType/
 * originalReferenceId — the same (referenceType, referenceId) pair the
 * ORIGINAL SUBSCRIPTION LedgerEntry was posted with (e.g.
 * originalReferenceType: "subscription", originalReferenceId:
 * <subscription.id> — see handlePaymentSucceeded above). This is what
 * correlates a refund/chargeback back to the specific revenue event a
 * Founding Partner commission may have been computed from.
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
