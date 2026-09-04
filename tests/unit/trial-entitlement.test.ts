import { describe, it, expect } from "vitest";
import { isTrialActive } from "@/lib/entitlements/trial";

describe("isTrialActive", () => {
  it("returns false for no trial at all", () => {
    expect(isTrialActive(null)).toBe(false);
  });

  it("returns true for an ACTIVE trial with a future expiry", () => {
    expect(isTrialActive({ status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000) })).toBe(true);
  });

  it("returns false for an ACTIVE trial whose expiry has already passed (lazy expiry)", () => {
    expect(isTrialActive({ status: "ACTIVE", expiresAt: new Date(Date.now() - 60_000) })).toBe(false);
  });

  it("returns false for a CONVERTED trial even with a future expiry", () => {
    expect(isTrialActive({ status: "CONVERTED", expiresAt: new Date(Date.now() + 60_000) })).toBe(false);
  });

  it("returns false for an EXPIRED trial", () => {
    expect(isTrialActive({ status: "EXPIRED", expiresAt: new Date(Date.now() - 60_000) })).toBe(false);
  });

  it("returns false for a CANCELLED trial even with a future expiry", () => {
    expect(isTrialActive({ status: "CANCELLED", expiresAt: new Date(Date.now() + 60_000) })).toBe(false);
  });

  it("accepts an expiresAt string as well as a Date", () => {
    expect(isTrialActive({ status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
  });
});
