import { nanoid } from "nanoid";
import type {
  AttachPaymentMethodInput,
  CreateCustomerInput,
  CreateCustomerResult,
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
