import { describe, it, expect } from "vitest";
import { pctChange, ratePercent, rangeBounds } from "@/lib/analytics/rates";

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

describe("rangeBounds", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("'all' has no since and no comparison window", () => {
    expect(rangeBounds("all", now)).toEqual({ since: null, prevSince: null, prevUntil: null });
  });

  it("'today' starts at UTC midnight of the given day", () => {
    const { since } = rangeBounds("today", now);
    expect(since?.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("7d/30d/90d each cover the right span, ending now", () => {
    expect(now.getTime() - rangeBounds("7d", now).since!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(now.getTime() - rangeBounds("30d", now).since!.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(now.getTime() - rangeBounds("90d", now).since!.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("the previous window is an equal-length span immediately before the current one, with no gap or overlap", () => {
    const { since, prevSince, prevUntil } = rangeBounds("7d", now);
    expect(prevUntil).toEqual(since);
    expect(since!.getTime() - prevSince!.getTime()).toBe(now.getTime() - since!.getTime());
  });
});
