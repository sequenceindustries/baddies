import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { getBusinessConfig } from "@/lib/config/settings";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Dummy checkout — buy the platform-wide VIP pass (UnlimitedSubscription;
 * model name kept to limit the rename's blast radius). One price, unlocks
 * VIP-tier content from every creator who's opted in
 * (CreatorProfile.unlimitedOptedIn) — see src/lib/entitlements/content.ts.
 *
 * Unlike the per-creator VVIP checkout, this deliberately posts NO ledger
 * revenue event at purchase time: the money isn't owed to any single
 * creator yet. Disbursing it to participating creators is the allocation
 * engine's job (src/lib/entitlements/unlimited.ts#computeUnlimitedAllocations
 * + postUnlimitedAllocationEvent) — which nothing currently invokes on a
 * schedule. That's a pre-existing, explicitly flagged Sprint 5 gap, not
 * something this route should paper over by inventing a platform wallet.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const existing = await db.unlimitedSubscription.findFirst({
    where: { fanId: user.id, status: "ACTIVE", currentPeriodEnd: { gte: new Date() } },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have an active VIP pass." }, { status: 409 });
  }

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payment processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const config = await getBusinessConfig();
  const priceUsd = config.vipPassPriceUsd;

  const provider = getPaymentProvider();
  const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
  const providerSub = await provider.createSubscription({
    providerCustomerId: providerCustomer.providerCustomerId,
    providerPriceId: "stub_price_vip_pass",
    metadata: { subscriptionType: "VIP_PASS" },
  });

  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await db.unlimitedSubscription.create({
    data: {
      fanId: user.id,
      status: "ACTIVE",
      priceUsdAtPurchase: priceUsd,
      currentPeriodEnd,
      paymentProviderSubscriptionId: providerSub.providerSubscriptionId,
    },
  });

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
