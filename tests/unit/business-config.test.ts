import { describe, it, expect } from "vitest";
import { DEFAULT_BUSINESS_CONFIG, BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

describe("business config defaults", () => {
  it("locks creator share at 80% and platform share at 20% per MVP assumption", () => {
    expect(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.CREATOR_SHARE]).toBe("0.80");
    expect(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.PLATFORM_SHARE]).toBe("0.20");
  });

  it("creator share + platform share sum to 1.0", () => {
    const creator = Number(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.CREATOR_SHARE]);
    const platform = Number(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.PLATFORM_SHARE]);
    expect(creator + platform).toBeCloseTo(1.0, 5);
  });

  it("default prices match the locked MVP pricing", () => {
    expect(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.ENTRY_PRICE_USD]).toBe("2.99");
    expect(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.VIP_PRICE_USD]).toBe("9.99");
    expect(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.UNLIMITED_PRICE_USD]).toBe("19.99");
  });
});
