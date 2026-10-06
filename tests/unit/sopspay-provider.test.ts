import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { SopspayPaymentProvider, verifySopspaySignature } from "@/lib/providers/payment/sopspay";

const SECRET = "test-webhook-secret";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");

describe("SOPSPAY payment provider", () => {
  beforeEach(() => {
    vi.stubEnv("SOPSPAY_API_KEY", "test-api-key");
    vi.stubEnv("SOPSPAY_WEBHOOK_SECRET", ` ${SECRET}\n`); // pasted-with-whitespace is tolerated
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses to construct without both credentials", () => {
    vi.stubEnv("SOPSPAY_WEBHOOK_SECRET", "");
    expect(() => new SopspayPaymentProvider()).toThrow(/must both be set/);
  });

  describe("webhook signature", () => {
    it("accepts a valid HMAC-SHA256 hex signature (any case)", () => {
      const body = '{"event":"payment.completed"}';
      expect(verifySopspaySignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
    });

    it("rejects a tampered body, wrong secret, or malformed signature", () => {
      const body = '{"event":"payment.completed","amount":9.99}';
      expect(verifySopspaySignature(body.replace("9.99", "0.01"), sign(body), SECRET)).toBe(false);
      expect(verifySopspaySignature(body, sign(body, "other"), SECRET)).toBe(false);
      expect(verifySopspaySignature(body, "not-hex", SECRET)).toBe(false);
      expect(verifySopspaySignature(body, "", SECRET)).toBe(false);
    });
  });

  describe("verifyAndParseWebhook", () => {
    it("maps a completed payment to payment.succeeded with link_id/amount/currency", () => {
      const body = JSON.stringify({ event: "payment.completed", status: "completed", link_id: "lnk_1", amount: "19.99", currency: "usd", payment_id: "pay_1" });
      const event = new SopspayPaymentProvider().verifyAndParseWebhook(body, sign(body));
      expect(event.type).toBe("payment.succeeded");
      expect(event.providerEventId).toBe("payment.completed:lnk_1");
      expect(event.data).toEqual({ providerCheckoutId: "lnk_1", providerPaymentId: "pay_1", amountUsd: 19.99, currency: "USD" });
    });

    it("does not treat payment.completed with a non-final status as success", () => {
      const body = JSON.stringify({ event: "payment.completed", status: "pending", link_id: "lnk_2", amount: 5, currency: "USD" });
      expect(new SopspayPaymentProvider().verifyAndParseWebhook(body, sign(body)).type).not.toBe("payment.succeeded");
    });

    it("maps failed/expired payments to payment.failed", () => {
      const body = JSON.stringify({ event: "payment.expired", link_id: "lnk_3" });
      const event = new SopspayPaymentProvider().verifyAndParseWebhook(body, sign(body));
      expect(event.type).toBe("payment.failed");
      expect(event.data.providerCheckoutId).toBe("lnk_3");
    });

    it("throws on an invalid signature", () => {
      const body = JSON.stringify({ event: "payment.completed", status: "completed", link_id: "x", amount: 1, currency: "USD" });
      expect(() => new SopspayPaymentProvider().verifyAndParseWebhook(body, "0".repeat(64))).toThrow(/signature/);
    });
  });

  describe("createHostedCheckoutSession", () => {
    const input = {
      pendingOrderId: "order_1",
      providerCustomerId: "user_1",
      customerEmail: "fan@example.test",
      amountUsd: 9.99,
      currency: "USD",
      successUrl: "https://baddies.africa/creators/c1?checkout=success",
      cancelUrl: "https://baddies.africa/creators/c1?checkout=cancelled",
      metadata: {},
    };

    it("posts the documented request and returns link_id + hosted checkout URL", async () => {
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ data: { link_id: "lnk_abc", payment_url: "https://checkout.sopspay.com/p/lnk_abc" } }), { status: 200 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await new SopspayPaymentProvider().createHostedCheckoutSession(input);

      expect(result).toEqual({ providerCheckoutId: "lnk_abc", redirectUrl: "https://checkout.sopspay.com/p/lnk_abc" });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.sopspay.com/api-create-payment-link");
      expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("test-api-key");
      expect(init.redirect).toBe("error");
      expect(JSON.parse(init.body as string)).toEqual({
        amount: 9.99,
        currency: "USD",
        customer_email: "fan@example.test",
        description: "baddies order order_1",
        provider: "hosted",
        payment_url: input.successUrl,
      });
    });

    it("refuses a checkout URL outside checkout.sopspay.com", async () => {
      vi.stubGlobal("fetch", async () =>
        new Response(JSON.stringify({ link_id: "lnk_x", payment_url: "https://evil.example/pay" }), { status: 200 })
      );
      await expect(new SopspayPaymentProvider().createHostedCheckoutSession(input)).rejects.toThrow(/checkout.sopspay.com/);
    });

    it("surfaces API errors", async () => {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "bad key" }), { status: 401 }));
      await expect(new SopspayPaymentProvider().createHostedCheckoutSession(input)).rejects.toThrow(/HTTP 401/);
    });
  });
});
