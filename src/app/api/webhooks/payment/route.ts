import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/providers/payment";
import { db } from "@/lib/db/client";
import { postRevenueEvent, postReversalEvent, recomputeWalletBalances } from "@/lib/ledger/service";

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
