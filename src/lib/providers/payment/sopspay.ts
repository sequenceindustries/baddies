import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AttachPaymentMethodInput,
  CreateCustomerInput,
  CreateCustomerResult,
  CreateHostedCheckoutSessionInput,
  CreateHostedCheckoutSessionResult,
  CreateOneTimePaymentInput,
  CreateOneTimePaymentResult,
  CreatePayoutInput,
  CreatePayoutResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundInput,
  RefundResult,
} from "./types";

/**
 * SOPSPAY — multi-provider fiat-to-crypto hosted checkout (settles USDC
 * to the company wallet). Implemented from SOPSPAY's own Custom API kit
 * and PHP SDK (plugin.sopspay.com, v1.0.0):
 *
 *   - Create: POST https://api.sopspay.com/api-create-payment-link with
 *     header X-API-Key; body { amount, currency, customer_email,
 *     description, provider: "hosted", payment_url (return URL) }.
 *     Response (optionally wrapped in `data`) carries `link_id` and a
 *     checkout URL that must be https://checkout.sopspay.com.
 *   - Webhook: HMAC-SHA256 (hex) of the raw body with the Webhook
 *     Secret, in X-Sopspay-Signature (legacy X-Rampex-Signature /
 *     X-Webhook-Signature). Only `event: "payment.completed"` with status
 *     completed/paid/success is payment proof, reconciled by link_id +
 *     amount + currency — which the webhook route's handlePaymentSucceeded
 *     already does against the PendingOrder.
 *
 * What SOPSPAY doesn't do (by its own description): recurring billing,
 * provider refunds, chargebacks or payouts. Refunds are a baddies policy
 * matter handled outside the processor, and creator payouts stay manual
 * — those methods throw rather than pretend.
 */
const API_BASE = "https://api.sopspay.com";
const CHECKOUT_HOST = "checkout.sopspay.com";
const MAX_WEBHOOK_BYTES = 262_144;
const COMPLETED_STATUSES = new Set(["completed", "paid", "success"]);

export function sopspayCredentials(): { apiKey: string; webhookSecret: string } | null {
  const apiKey = process.env.SOPSPAY_API_KEY?.trim();
  const webhookSecret = process.env.SOPSPAY_WEBHOOK_SECRET?.trim();
  return apiKey && webhookSecret ? { apiKey, webhookSecret } : null;
}

export function verifySopspaySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const sig = signatureHeader.trim().toLowerCase();
  if (!secret || !rawBody || Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES || !/^[a-f0-9]{64}$/.test(sig)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}

export class SopspayPaymentProvider implements PaymentProvider {
  readonly name = "sopspay";

  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor() {
    const creds = sopspayCredentials();
    if (!creds) {
      throw new Error("SOPSPAY_API_KEY and SOPSPAY_WEBHOOK_SECRET must both be set when PAYMENT_PROVIDER=sopspay.");
    }
    this.apiKey = creds.apiKey;
    this.webhookSecret = creds.webhookSecret;
  }

  // SOPSPAY has no customer object — the fan's own User.id is the stable
  // reference, kept on our side (PendingOrder.customerId).
  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    return { providerCustomerId: input.userId };
  }

  async createHostedCheckoutSession(
    input: CreateHostedCheckoutSessionInput
  ): Promise<CreateHostedCheckoutSessionResult> {
    const amount = Number(input.amountUsd);
    const currency = input.currency.toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3,8}$/.test(currency)) {
      throw new Error("Invalid SOPSPAY amount/currency.");
    }
    if (!input.customerEmail) {
      throw new Error("SOPSPAY requires the customer's email.");
    }

    const res = await fetch(`${API_BASE}/api-create-payment-link`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": this.apiKey },
      body: JSON.stringify({
        amount,
        currency,
        customer_email: input.customerEmail,
        description: `baddies order ${input.pendingOrderId}`,
        provider: "hosted",
        payment_url: input.successUrl,
      }),
      // Never follow a redirect with the API key attached.
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });

    const raw = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`SOPSPAY returned a non-JSON response (HTTP ${res.status}).`);
    }
    if (!res.ok || json.success === false) {
      // e.g. { success:false, error:{ code:"NO_WALLET", message:"..." } }
      const error = (json.error && typeof json.error === "object" ? json.error : {}) as Record<string, unknown>;
      const detail = [error.code, error.message ?? (typeof json.error === "string" ? json.error : undefined)]
        .filter(Boolean)
        .join(": ");
      throw new Error(`SOPSPAY create-payment failed (HTTP ${res.status})${detail ? ` — ${detail}` : ""}.`);
    }

    const data = (json.data && typeof json.data === "object" ? json.data : json) as Record<string, unknown>;
    const linkId = String(data.link_id ?? "").trim();
    if (!linkId || linkId.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(linkId)) {
      throw new Error("SOPSPAY returned an invalid link_id.");
    }
    const checkoutUrl = String(data.payment_url ?? data.redirect_url ?? data.short_url ?? "");
    let parsed: URL;
    try {
      parsed = new URL(checkoutUrl);
    } catch {
      throw new Error("SOPSPAY returned an invalid checkout URL.");
    }
    // Only ever send a fan to SOPSPAY's own hosted checkout.
    if (parsed.protocol !== "https:" || parsed.hostname !== CHECKOUT_HOST) {
      throw new Error("SOPSPAY returned a checkout URL outside checkout.sopspay.com.");
    }

    return { providerCheckoutId: linkId, redirectUrl: parsed.toString() };
  }

  verifyAndParseWebhook(rawBody: string, signatureHeader: string): PaymentWebhookEvent {
    if (!verifySopspaySignature(rawBody, signatureHeader, this.webhookSecret)) {
      throw new Error("Invalid SOPSPAY webhook signature.");
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventName = String(payload.event ?? "");
    const status = String(payload.status ?? "").toLowerCase();
    const linkId = payload.link_id != null ? String(payload.link_id) : undefined;

    // SOPSPAY sends no separate event id — one event type per payment
    // link is the natural dedup key (WebhookEvent is unique on it).
    const providerEventId = String(payload.id ?? payload.event_id ?? `${eventName}:${linkId ?? "unknown"}`);

    if (eventName === "payment.completed" && COMPLETED_STATUSES.has(status)) {
      return {
        type: "payment.succeeded",
        providerEventId,
        occurredAt: new Date(),
        data: {
          providerCheckoutId: linkId,
          providerPaymentId: payload.payment_id != null ? String(payload.payment_id) : undefined,
          // handlePaymentSucceeded reconciles this against the order's own
          // amount/currency and refuses (MANUAL_REVIEW flag) on mismatch.
          amountUsd: payload.amount != null && payload.amount !== "" ? Number(payload.amount) : undefined,
          currency: String(payload.currency ?? "").toUpperCase(),
        },
      };
    }

    if (eventName === "payment.failed" || eventName === "payment.expired" || eventName === "payment.cancelled") {
      return { type: "payment.failed", providerEventId, occurredAt: new Date(), data: { providerCheckoutId: linkId } };
    }

    // Anything else (including payment.completed with a non-final status)
    // is recorded by the webhook route and otherwise ignored.
    return {
      type: eventName as PaymentWebhookEvent["type"],
      providerEventId,
      occurredAt: new Date(),
      data: { providerCheckoutId: linkId, status },
    };
  }

  // --- Not offered by SOPSPAY ------------------------------------------

  async attachPaymentMethod(_input: AttachPaymentMethodInput): Promise<void> {
    throw new Error("SOPSPAY has no stored payment methods.");
  }

  async createSubscription(_input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    throw new Error("SOPSPAY has no recurring billing — subscriptions are prepaid packages.");
  }

  // Prepaid packages have nothing to cancel on the processor side.
  async cancelSubscription(_providerSubscriptionId: string): Promise<void> {}

  async createOneTimePayment(_input: CreateOneTimePaymentInput): Promise<CreateOneTimePaymentResult> {
    throw new Error("Use createHostedCheckoutSession with SOPSPAY.");
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error("SOPSPAY doesn't process refunds — handle refunds manually under baddies' refund policy.");
  }

  async createPayout(_input: CreatePayoutInput): Promise<CreatePayoutResult> {
    throw new Error("SOPSPAY doesn't do payouts — creator payouts are handled outside the payment provider.");
  }
}
