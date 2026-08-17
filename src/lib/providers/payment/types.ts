/**
 * PaymentProvider — abstraction over the payment processor. Per build
 * brief §21: "Do NOT hard-code a single payment processor... The processor
 * itself remains TBD pending underwriting."
 *
 * Critical rule: the browser/client NEVER tells the backend "payment
 * succeeded." All state transitions (subscription active, PPV purchased,
 * payout paid) happen from `handleWebhookEvent`, which is the only
 * authoritative source of truth. See src/app/api/webhooks/payment/route.ts.
 */

export interface CreateCustomerInput {
  userId: string;
  email: string;
}

export interface CreateCustomerResult {
  providerCustomerId: string;
}

export interface AttachPaymentMethodInput {
  providerCustomerId: string;
  providerPaymentMethodToken: string; // tokenized client-side, never raw card data
}

export interface CreateSubscriptionInput {
  providerCustomerId: string;
  providerPriceId: string; // maps to ENTRY/VIP/UNLIMITED price objects on the processor side
  metadata: Record<string, string>; // e.g. { subscriptionType: "ENTRY", creatorProfileId: "..." }
}

export interface CreateSubscriptionResult {
  providerSubscriptionId: string;
  status: string; // raw processor status, mapped by caller to SubscriptionStatus
}

export interface CreateOneTimePaymentInput {
  providerCustomerId: string;
  amountUsd: number;
  metadata: Record<string, string>; // e.g. { purchaseType: "PPV", contentId: "...", tip: "true" }
}

export interface CreateOneTimePaymentResult {
  providerTransactionId: string;
  status: string;
}

export interface RefundInput {
  providerTransactionId: string;
  amountUsd?: number; // omit for full refund
  reason?: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: string;
}

export interface CreatePayoutInput {
  providerAccountId: string; // creator's connected payout account on the processor
  amountUsd: number;
  currency: "USD" | "ZAR";
}

export interface CreatePayoutResult {
  providerPayoutId: string;
  status: string;
}

/** Normalized webhook event, after signature verification and provider-specific parsing. */
export type PaymentWebhookEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.past_due"
  | "subscription.cancelled"
  | "refund.completed"
  | "chargeback.opened"
  | "chargeback.resolved"
  | "payout.paid"
  | "payout.failed";

export interface PaymentWebhookEvent {
  type: PaymentWebhookEventType;
  providerEventId: string;
  occurredAt: Date;
  data: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;

  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  attachPaymentMethod(input: AttachPaymentMethodInput): Promise<void>;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  createOneTimePayment(input: CreateOneTimePaymentInput): Promise<CreateOneTimePaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult>;

  /**
   * Verifies the raw webhook signature and parses it into a normalized
   * event. Throws if the signature is invalid — callers must reject the
   * request (do not process unverified webhook bodies).
   */
  verifyAndParseWebhook(rawBody: string, signatureHeader: string): PaymentWebhookEvent;
}
