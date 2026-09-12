import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";

// Always dynamic: reads/writes live data and must never be statically
// prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Dev-only stub-checkout confirmation endpoint. Exercises the exact
 * redirect → confirm → webhook → entitlement chain a real hosted-
 * checkout processor would eventually trigger, without a live
 * processor: GET returns the pending order's display info for
 * src/app/checkout/stub-confirm/page.tsx to render; POST simulates the
 * provider's own outcome (success/failure) by calling the REAL webhook
 * endpoint over HTTP with the same JSON shape
 * StubPaymentProvider.verifyAndParseWebhook already expects — so this
 * never bypasses the webhook-authoritative activation path, it just
 * stands in for the processor that would normally call it.
 *
 * Hard-blocked outside PAYMENT_PROVIDER=stub — this must never be
 * reachable in an environment serving real users (see
 * StubPaymentProvider's own top-level comment).
 */
function assertStubMode() {
  return process.env.PAYMENT_PROVIDER === "stub";
}

export async function GET(req: NextRequest) {
  if (!assertStubMode()) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const order = await db.pendingOrder.findUnique({
    where: { id: orderId },
    include: { creatorProfile: { include: { user: { include: { profile: true } } } } },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderType: order.orderType,
    amountUsd: Number(order.amountUsd),
    currency: order.currency,
    durationMonths: order.durationMonths,
    status: order.status,
    creatorDisplayName: order.creatorProfile?.user.profile?.displayName ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!assertStubMode()) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const orderId = json?.orderId as string | undefined;
  const outcome = json?.outcome as "success" | "failure" | undefined;
  if (!orderId || (outcome !== "success" && outcome !== "failure")) {
    return NextResponse.json({ error: "orderId and outcome ('success'|'failure') are required." }, { status: 400 });
  }

  const order = await db.pendingOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "AWAITING_PAYMENT") {
    return NextResponse.json({ error: `Order is already ${order.status.toLowerCase()}.` }, { status: 409 });
  }

  const webhookBody =
    outcome === "success"
      ? {
          id: `evt_${nanoid(12)}`,
          type: "payment.succeeded",
          data: {
            providerCheckoutId: order.providerCheckoutId,
            providerPaymentId: `stub_pay_${nanoid(12)}`,
            amountUsd: Number(order.amountUsd),
            currency: order.currency,
          },
        }
      : {
          id: `evt_${nanoid(12)}`,
          type: "payment.failed",
          data: { providerCheckoutId: order.providerCheckoutId },
        };

  // A real, over-the-wire call to the actual webhook route — this stub
  // never activates anything itself, it only plays the part of the
  // processor delivering the webhook. Same-origin, so no external
  // network dependency.
  const webhookRes = await fetch(`${req.nextUrl.origin}/api/webhooks/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-payment-signature": "stub" },
    body: JSON.stringify(webhookBody),
  });
  const webhookResult = await webhookRes.json().catch(() => null);

  return NextResponse.json({ ok: webhookRes.ok, webhookResult });
}
