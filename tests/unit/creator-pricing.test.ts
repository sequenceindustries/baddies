import { describe, it, expect } from "vitest";
import {
  resolveCreatorPricing,
  EXCLUSIVE_MIN_PRICE_USD,
  EXCLUSIVE_DEFAULT_PRICE_USD,
} from "@/lib/creator/pricing";

describe("resolveCreatorPricing", () => {
  it("falls back to the platform default when a creator hasn't set their own price", async () => {
    const pricing = await resolveCreatorPricing({ vvipPriceOverride: null });
    expect(pricing.vvipPriceUsd).toBe(EXCLUSIVE_DEFAULT_PRICE_USD);
  });

  it("uses the creator's own price once they've set one", async () => {
    const pricing = await resolveCreatorPricing({ vvipPriceOverride: 14.5 });
    expect(pricing.vvipPriceUsd).toBe(14.5);
  });

  it("reads a Decimal-like value (has toString/valueOf, not a plain number)", async () => {
    const decimalLike = { toString: () => "7.25", valueOf: () => "7.25" };
    const pricing = await resolveCreatorPricing({ vvipPriceOverride: decimalLike });
    expect(pricing.vvipPriceUsd).toBe(7.25);
  });

  it("floors at the platform minimum even if a stored value is somehow lower", async () => {
    const pricing = await resolveCreatorPricing({ vvipPriceOverride: 1 });
    expect(pricing.vvipPriceUsd).toBe(EXCLUSIVE_MIN_PRICE_USD);
  });

  it("falls back to the default for a non-numeric stored value rather than throwing", async () => {
    const pricing = await resolveCreatorPricing({ vvipPriceOverride: "not-a-number" });
    expect(pricing.vvipPriceUsd).toBe(EXCLUSIVE_DEFAULT_PRICE_USD);
  });
});
