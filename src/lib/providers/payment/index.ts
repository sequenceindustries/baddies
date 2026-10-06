import type { PaymentProvider } from "./types";
import { StubPaymentProvider } from "./stub";

export * from "./types";

/**
 * Single place that resolves which PaymentProvider implementation is
 * active. The real processor is TBD pending underwriting (build brief
 * §21) — add the vendor's implementation as a sibling file once approved,
 * and register it here. Application code (subscriptions, PPV, tips,
 * payouts) must only ever call through this interface.
 */
/**
 * The stub trusts every webhook body unsigned and lets the stub-confirm
 * page "pay" for any order, so it must never serve real users: in
 * production it is refused outright unless ALLOW_STUB_PAYMENTS=true is
 * set deliberately (e.g. a private staging deploy).
 */
export function stubPaymentsBlocked(): boolean {
  return (
    (process.env.PAYMENT_PROVIDER ?? "stub") === "stub" &&
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_STUB_PAYMENTS !== "true"
  );
}

/** True when checkout can actually take money (or stub-pay outside production). */
export function paymentsAvailable(): boolean {
  return (process.env.PAYMENT_PROVIDER ?? "stub") === "stub" && !stubPaymentsBlocked();
}

export const PAYMENTS_UNAVAILABLE_MESSAGE = "Payments aren't open yet — check back soon.";

export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER ?? "stub";
  if (stubPaymentsBlocked()) {
    throw new Error("The stub payment provider is disabled in production. Configure a real PAYMENT_PROVIDER.");
  }

  switch (providerName) {
    case "stub":
      return new StubPaymentProvider();
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${providerName}". Register an implementation in src/lib/providers/payment/index.ts.`
      );
  }
}
