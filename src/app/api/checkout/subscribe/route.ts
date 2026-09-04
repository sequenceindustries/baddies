import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { postRevenueEvent, recomputeWalletBalances } from "@/lib/ledger/service";
import { markTrialConvertedIfActive } from "@/lib/entitlements/trial";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Dummy checkout — subscribe to a creator's VVIP tier (their own price,
 * set via PATCH /api/creator/settings, or the platform default). There's
 * only one creator-level subscription tier now — see prisma/schema.prisma's
 * ContentAccessLevel comment for the full Free/VIP/VVIP model. For the
 * separate platform-wide VIP pass, see POST /api/checkout/vip-pass.
 *
 * No real payment vendor is selected yet (build brief §21), so this route
 * only ever runs against PAYMENT_PROVIDER=stub. Per the architecture, real
 * providers must never have the client-visible request mark a payment
 * "succeeded" — only the processor's webhook is authoritative (see
 * src/app/api/webhooks/payment/route.ts). The stub provider is
 * deterministic and synchronous, so — exactly like the stub verification
 * provider's instant-complete path in
 * src/app/api/creator/verification/start/route.ts — this route skips the
 * network round trip and applies the "webhook" outcome inline instead of
 * self-calling the HTTP webhook. Swapping in a real provider means this
 * route should stop writing the Subscription/ledger rows directly and
 * instead only call provider.createSubscription() + redirect to its
 * hosted checkout, leaving the writes to the webhook handler.
 */
const SubscribeSchema = z.object({
  creatorProfileId: z.string().min(1),
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
  const { creatorProfileId } = parsed.data;

  const creator = await db.creatorProfile.findUnique({ where: { id: creatorProfileId } });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }
  if (creator.userId === user.id) {
    return NextResponse.json({ error: "You cannot subscribe to your own creator profile." }, { status: 400 });
  }

  const existing = await db.subscription.findFirst({
    where: { fanId: user.id, creatorProfileId, status: "ACTIVE", currentPeriodEnd: { gte: new Date() } },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have an active subscription to this creator." }, { status: 409 });
  }

  const pricing = await resolveCreatorPricing(creator);
  const priceUsd = pricing.vvipPriceUsd;

  const creatorWallet = await db.wallet.upsert({
    where: { userId: creator.userId },
    create: { userId: creator.userId },
    update: {},
  });

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payment processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const provider = getPaymentProvider();
  const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
  const providerSub = await provider.createSubscription({
    providerCustomerId: providerCustomer.providerCustomerId,
    providerPriceId: `stub_price_vvip_${creatorProfileId}`,
    metadata: { subscriptionType: "VVIP", creatorProfileId },
  });

  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await db.subscription.create({
    data: {
      fanId: user.id,
      creatorProfileId,
      status: "ACTIVE",
      priceUsdAtPurchase: priceUsd,
      currentPeriodEnd,
      paymentProviderSubscriptionId: providerSub.providerSubscriptionId,
    },
  });

  await postRevenueEvent({
    walletId: creatorWallet.id,
    creatorProfileId,
    type: "SUBSCRIPTION",
    grossAmountUsd: priceUsd,
    referenceType: "subscription",
    referenceId: subscription.id,
    description: "VVIP subscription (stub checkout)",
  });
  await recomputeWalletBalances(creatorWallet.id);

  // MASTER REQUIREMENTS §11 — subscribing to a creator while on an
  // active trial is a genuine acquisition win too, not just buying the
  // VIP pass itself. A no-op if this fan never had a trial.
  await markTrialConvertedIfActive(user.id);

  return NextResponse.json(
    {
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      priceUsd,
    },
    { status: 201 }
  );
}
