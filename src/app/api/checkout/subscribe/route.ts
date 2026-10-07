import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/seo/site-url";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider, paymentsAvailable, PAYMENTS_UNAVAILABLE_MESSAGE } from "@/lib/providers/payment";
import { resolveCreatorPricing, resolveCreatorPackagePrice } from "@/lib/creator/pricing";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Buy (or renew) a creator's Exclusive (VVIP) subscription for a
 * chosen prepaid package duration (1/3/6/12 months).
 *
 * Monetisation redesign — this route no longer writes a Subscription
 * or LedgerEntry row itself (that used to happen synchronously here,
 * against the stub provider, before any real payment vendor existed —
 * see this route's own prior doc comment). It now only creates a
 * PendingOrder and hands back a hosted-checkout redirect; ONLY
 * src/app/api/webhooks/payment/route.ts, once it has independently
 * verified the payment, creates/extends the Subscription and posts the
 * ledger entry. Never trust this request/response pair to mean
 * "payment succeeded" — see that route's own doc comment.
 *
 * Renewal: a fan with an existing subscription (active, expired, or
 * even one that was cancelled) can buy again at any time — this is the
 * ENTIRE renewal mechanism in a prepaid, no-auto-billing model. If
 * their current period hasn't ended yet, the webhook extends
 * currentPeriodEnd from where it left off rather than from today (see
 * that route's own comment) — so buying ahead of expiry never wastes
 * paid time.
 */
const SubscribeSchema = z.object({
  creatorProfileId: z.string().min(1),
  // Must match SUBSCRIPTION_DURATIONS_MONTHS in src/lib/creator/pricing.ts.
  durationMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = SubscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { creatorProfileId, durationMonths } = parsed.data;

  const creator = await db.creatorProfile.findUnique({ where: { id: creatorProfileId } });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }
  if (creator.userId === user.id) {
    return NextResponse.json({ error: "You cannot subscribe to your own creator profile." }, { status: 400 });
  }

  const basePricing = await resolveCreatorPricing(creator);
  const amountUsd = await resolveCreatorPackagePrice(creatorProfileId, basePricing.vvipPriceUsd, durationMonths);

  if (!paymentsAvailable()) {
    return NextResponse.json({ error: PAYMENTS_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  const provider = getPaymentProvider();
  const order = await db.pendingOrder.create({
    data: {
      customerId: user.id,
      orderType: "EXCLUSIVE_SUBSCRIPTION",
      creatorProfileId,
      durationMonths,
      amountUsd,
      currency: "USD",
      status: "PENDING",
      providerName: provider.name,
    },
  });

  // A provider failure (bad config, provider outage) must answer the fan
  // with a clear message, never an unhandled 500 — and must not leave the
  // order looking payable.
  let checkout: Awaited<ReturnType<typeof provider.createHostedCheckoutSession>>;
  try {
    const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
    const origin = publicOrigin();
    checkout = await provider.createHostedCheckoutSession({
      pendingOrderId: order.id,
      providerCustomerId: providerCustomer.providerCustomerId,
      customerEmail: user.email,
      amountUsd,
      currency: "USD",
      successUrl: `${origin}/creators/${creatorProfileId}?checkout=success`,
      cancelUrl: `${origin}/creators/${creatorProfileId}?checkout=cancelled`,
      metadata: {
        pendingOrderId: order.id,
        orderType: "EXCLUSIVE_SUBSCRIPTION",
        creatorProfileId,
        durationMonths: String(durationMonths),
      },
    });
  } catch (err) {
    console.error("[checkout:subscribe] provider checkout creation failed", err);
    await db.pendingOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly." }, { status: 502 });
  }

  await db.pendingOrder.update({
    where: { id: order.id },
    data: {
      status: "AWAITING_PAYMENT",
      providerCheckoutId: checkout.providerCheckoutId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  return NextResponse.json(
    { pendingOrderId: order.id, redirectUrl: checkout.redirectUrl, amountUsd, durationMonths },
    { status: 201 }
  );
}
