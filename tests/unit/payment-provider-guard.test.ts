import { describe, it, expect, afterEach, vi } from "vitest";
import { stubPaymentsBlocked, paymentsAvailable, getPaymentProvider } from "@/lib/providers/payment";

describe("stub payment provider production guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks the stub in production (the default provider)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "stub");
    expect(stubPaymentsBlocked()).toBe(true);
    expect(paymentsAvailable()).toBe(false);
    expect(() => getPaymentProvider()).toThrow(/disabled in production/);
  });

  it("allows the stub in production only with an explicit ALLOW_STUB_PAYMENTS=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "stub");
    vi.stubEnv("ALLOW_STUB_PAYMENTS", "true");
    expect(stubPaymentsBlocked()).toBe(false);
    expect(getPaymentProvider().name).toBe("stub");
  });

  it("allows the stub outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENT_PROVIDER", "stub");
    expect(stubPaymentsBlocked()).toBe(false);
    expect(paymentsAvailable()).toBe(true);
  });
});
