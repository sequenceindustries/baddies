import { describe, it, expect } from "vitest";
import { resolveCreatorPricing, EXCLUSIVE_PRICE_USD } from "@/lib/creator/pricing";
import { DEFAULT_BUSINESS_CONFIG, BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

describe("pricing", () => {
  it("Exclusive is a flat $10 for every creator", () => {
    expect(EXCLUSIVE_PRICE_USD).toBe(10);
  });

  it("ignores any legacy per-creator price override", async () => {
    for (const override of [null, 14.5, 1, "7.25", "not-a-number"]) {
      const pricing = await resolveCreatorPricing({ vvipPriceOverride: override });
      expect(pricing.vvipPriceUsd).toBe(EXCLUSIVE_PRICE_USD);
    }
  });

  it("seeds VIP Pass at $5 and the Exclusive default at $10", () => {
    expect(Number(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.VIP_PASS_PRICE_USD])).toBe(5);
    expect(Number(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.VVIP_DEFAULT_PRICE_USD])).toBe(10);
  });
});
