import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { POST as paymentWebhook } from "@/app/api/webhooks/payment/route";

/**
 * Integration test (real Postgres): a signed SOPSPAY payment.completed
 * webhook, sent to the real POST /api/webhooks/payment handler with
 * PAYMENT_PROVIDER=sopspay, activates exactly the PendingOrder it
 * references — and an unsigned/tampered or amount-mismatched one doesn't.
 */
const SECRET = "integration-webhook-secret";

let dbAvailable = true;
beforeAll(async () => {
  vi.stubEnv("PAYMENT_PROVIDER", "sopspay");
  vi.stubEnv("SOPSPAY_API_KEY", "integration-api-key");
  vi.stubEnv("SOPSPAY_WEBHOOK_SECRET", SECRET);
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (dbAvailable) await db.$disconnect();
});

function webhook(payload: object, signature?: string) {
  const body = JSON.stringify(payload);
  return new NextRequest("http://localhost/api/webhooks/payment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sopspay-signature": signature ?? createHmac("sha256", SECRET).update(body).digest("hex"),
    },
    body,
  });
}

describe.skipIf(!dbAvailable)("SOPSPAY webhook → VIP pass activation (integration)", () => {
  const userIds: string[] = [];

  async function vipOrder(linkId: string) {
    const fan = await db.user.create({
      data: { email: `sopspay-fan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`, passwordHash: "x", role: "FAN" },
    });
    userIds.push(fan.id);
    const order = await db.pendingOrder.create({
      data: {
        customerId: fan.id,
        orderType: "VIP_PASS",
        durationMonths: 3,
        amountUsd: 19.99,
        currency: "USD",
        status: "AWAITING_PAYMENT",
        providerName: "sopspay",
        providerCheckoutId: linkId,
      },
    });
    return { fan, order };
  }

  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { provider: "sopspay", providerEventId: { contains: "lnk_it_" } } });
    await db.abuseFlag.deleteMany({ where: { reason: { contains: "lnk_it_" } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("activates the order on a valid signed payment.completed, idempotently", async () => {
    const linkId = `lnk_it_ok_${Date.now()}`;
    const { fan, order } = await vipOrder(linkId);
    const payload = { event: "payment.completed", status: "completed", link_id: linkId, amount: 19.99, currency: "USD", payment_id: `pay_${linkId}` };

    const res = await paymentWebhook(webhook(payload));
    expect(res.status).toBe(200);
    expect((await db.pendingOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("COMPLETED");
    const pass = await db.unlimitedSubscription.findFirstOrThrow({ where: { fanId: fan.id } });
    expect(pass.status).toBe("ACTIVE");

    // Redelivery is a no-op.
    const again = await paymentWebhook(webhook(payload));
    expect((await again.json()).duplicate).toBe(true);
    expect(await db.unlimitedSubscription.count({ where: { fanId: fan.id } })).toBe(1);
  });

  it("rejects an invalid signature and grants nothing", async () => {
    const linkId = `lnk_it_badsig_${Date.now()}`;
    const { fan, order } = await vipOrder(linkId);

    const res = await paymentWebhook(
      webhook({ event: "payment.completed", status: "completed", link_id: linkId, amount: 19.99, currency: "USD" }, "0".repeat(64))
    );

    expect(res.status).toBe(400);
    expect((await db.pendingOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_PAYMENT");
    expect(await db.unlimitedSubscription.count({ where: { fanId: fan.id } })).toBe(0);
  });

  it("refuses an amount that doesn't match the order and flags it for review", async () => {
    const linkId = `lnk_it_amount_${Date.now()}`;
    const { fan, order } = await vipOrder(linkId);

    await paymentWebhook(webhook({ event: "payment.completed", status: "completed", link_id: linkId, amount: 0.5, currency: "USD" }));

    expect((await db.pendingOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("FAILED");
    expect(await db.unlimitedSubscription.count({ where: { fanId: fan.id } })).toBe(0);
    expect(await db.abuseFlag.count({ where: { type: "MANUAL_REVIEW", reason: { contains: order.id } } })).toBe(1);
    await db.abuseFlag.deleteMany({ where: { reason: { contains: order.id } } });
  });
});
