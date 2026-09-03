import { describe, it, expect } from "vitest";
import { pctChange, ratePercent } from "@/lib/analytics/rates";

describe("pctChange", () => {
  it("returns null (not Infinity/NaN) when the previous period was zero", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });

  it("computes a positive percent change", () => {
    expect(pctChange(15, 10)).toBe(50);
  });

  it("computes a negative percent change", () => {
    expect(pctChange(5, 10)).toBe(-50);
  });
});

describe("ratePercent (funnel conversion rates)", () => {
  it("returns null (not Infinity/NaN) when nothing has reached the earlier stage yet", () => {
    expect(ratePercent(0, 0)).toBeNull();
  });

  it("returns null for a negative denominator rather than a nonsensical rate", () => {
    expect(ratePercent(2, -1)).toBeNull();
  });

  it("computes a real conversion rate", () => {
    expect(ratePercent(1, 2)).toBe(50);
  });

  it("rounds to one decimal place", () => {
    expect(ratePercent(1, 3)).toBe(33.3);
  });
});
