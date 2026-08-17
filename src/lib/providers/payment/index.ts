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
export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER ?? "stub";

  switch (providerName) {
    case "stub":
      return new StubPaymentProvider();
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${providerName}". Register an implementation in src/lib/providers/payment/index.ts.`
      );
  }
}
