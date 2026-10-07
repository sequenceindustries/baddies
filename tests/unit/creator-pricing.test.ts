import { describe, it, expect } from "vitest";
import { resolveCreatorPricing, EXCLUSIVE_PRICE_USD, VIP_PASS_DURATIONS_MONTHS } from "@/lib/creator/pricing";
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

  it("sells VIP Pass only as 3/6/12-month packages at $13.50 / $24 / $42", () => {
    expect([...VIP_PASS_DURATIONS_MONTHS]).toEqual([3, 6, 12]);
    const base = Number(DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.VIP_PASS_PRICE_USD]);
    const curve: Record<string, number> = JSON.parse(
      DEFAULT_BUSINESS_CONFIG[BUSINESS_CONFIG_KEYS.PRICING_VIP_PASS_DISCOUNT_CURVE]
    );
    const prices = VIP_PASS_DURATIONS_MONTHS.map((m) => Math.round(base * m * (1 - curve[String(m)]) * 100) / 100);
    expect(prices).toEqual([13.5, 24, 42]);
  });
});
