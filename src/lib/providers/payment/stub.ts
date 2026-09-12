import { nanoid } from "nanoid";
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
 * Stub PaymentProvider — simulates a processor for local dev and tests.
 * Moves no real money. `PAYMENT_PROVIDER=stub` must be blocked in any
 * environment that is reachable by real users (see production readiness
 * check in docs/architecture.md).
 */
export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    return { providerCustomerId: `stub_cus_${nanoid(12)}` };
  }

  async attachPaymentMethod(_input: AttachPaymentMethodInput): Promise<void> {
    // no-op in stub mode
  }

  async createSubscription(
    _input: CreateSubscriptionInput
  ): Promise<CreateSubscriptionResult> {
    return { providerSubscriptionId: `stub_sub_${nanoid(12)}`, status: "active" };
  }

  async cancelSubscription(_providerSubscriptionId: string): Promise<void> {
    // no-op in stub mode
  }

  async createOneTimePayment(
    input: CreateOneTimePaymentInput
  ): Promise<CreateOneTimePaymentResult> {
    return { providerTransactionId: `stub_txn_${nanoid(12)}`, status: "succeeded" };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    return { providerRefundId: `stub_rfnd_${nanoid(12)}`, status: "succeeded" };
  }

  async createPayout(_input: CreatePayoutInput): Promise<CreatePayoutResult> {
    return { providerPayoutId: `stub_po_${nanoid(12)}`, status: "paid" };
  }

  async createHostedCheckoutSession(
    input: CreateHostedCheckoutSessionInput
  ): Promise<CreateHostedCheckoutSessionResult> {
    // No real hosted page exists in stub mode — redirect to a local,
    // dev-only confirmation page that lets a developer/tester simulate
    // the provider's own outcome (success/failure) and, on success,
    // fires the exact same webhook shape a real processor's redirect
    // would eventually trigger. Relative URL — works unchanged whether
    // this route is called from localhost or a deployed stub
    // environment. Never wired to a real payment page; PAYMENT_PROVIDER
    // =stub is blocked in any environment reachable by real users (see
    // this class's own top-level comment).
    return {
      providerCheckoutId: `stub_chk_${nanoid(12)}`,
      redirectUrl: `/checkout/stub-confirm?orderId=${input.pendingOrderId}`,
    };
  }

  verifyAndParseWebhook(rawBody: string, _signatureHeader: string): PaymentWebhookEvent {
    // Stub mode trusts the body as-is; a real provider implementation MUST
    // verify an HMAC/signature here and throw on mismatch.
    const parsed = JSON.parse(rawBody);
    return {
      type: parsed.type,
      providerEventId: parsed.id ?? nanoid(12),
      occurredAt: new Date(),
      data: parsed.data ?? {},
    };
  }
}
