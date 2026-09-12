import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { resolveVipPassPackagePrice } from "@/lib/creator/pricing";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Buy (or renew) the platform-wide VIP Pass for a chosen prepaid
 * package duration (1/3/6/12 months). One price per duration, set
 * platform-wide (VipPassPlan) — never per-creator, unlocks VIP-tier
 * content from every creator who's opted in
 * (CreatorProfile.unlimitedOptedIn).
 *
 * Same pending-order/webhook-authoritative architecture as
 * POST /api/checkout/subscribe — see that route's own doc comment.
 * This route creates a PendingOrder and hands back a hosted-checkout
 * redirect only; the webhook creates/extends the UnlimitedSubscription.
 *
 * Unlike the per-creator Exclusive checkout, no ledger revenue event is
 * posted here or in the webhook for a VIP_PASS order: the money isn't
 * owed to any single creator at purchase time. Disbursing it to
 * participating creators is the VIP Creator Pool allocation engine's
 * job (src/lib/entitlements/unlimited.ts#computeUnlimitedAllocations +
 * postUnlimitedAllocationEvent) — wired up in a later phase, not
 * invented here as a platform-wallet workaround.
 */
const VipPassSchema = z.object({
  durationMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = VipPassSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { durationMonths } = parsed.data;

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payment processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const amountUsd = await resolveVipPassPackagePrice(durationMonths);

  const provider = getPaymentProvider();
  const order = await db.pendingOrder.create({
    data: {
      customerId: user.id,
      orderType: "VIP_PASS",
      durationMonths,
      amountUsd,
      currency: "USD",
      status: "PENDING",
      providerName: provider.name,
    },
  });

  const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
  const origin = req.nextUrl.origin;
  const checkout = await provider.createHostedCheckoutSession({
    pendingOrderId: order.id,
    providerCustomerId: providerCustomer.providerCustomerId,
    amountUsd,
    currency: "USD",
    successUrl: `${origin}/fan-subscriptions?checkout=success`,
    cancelUrl: `${origin}/fan-subscriptions?checkout=cancelled`,
    metadata: { pendingOrderId: order.id, orderType: "VIP_PASS", durationMonths: String(durationMonths) },
  });

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
