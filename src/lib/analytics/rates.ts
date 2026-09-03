/**
 * Shared rate-calculation and date-range helpers for the admin Command
 * Centre (period-over-period deltas, funnel conversion rates, the
 * Today/7d/30d/90d/All-time range picker every admin data route uses).
 * Extracted out of the route handlers so the "0-denominator → null,
 * never NaN/Infinity" behavior is unit-tested directly rather than only
 * exercised incidentally through an API route, and so every route
 * shares one date-math implementation instead of copy-pasting it.
 */

export const RANGES = ["today", "7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];

/** since/prevSince/prevUntil for a range picker value — prev bounds are
 * the immediately preceding window of equal length, all null for "all"
 * (no meaningful comparison window when there's no lower bound to
 * begin with). */
export function rangeBounds(range: Range, now: Date) {
  if (range === "all") return { since: null as Date | null, prevSince: null as Date | null, prevUntil: null as Date | null };

  const since =
    range === "today"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(now.getTime() - { "7d": 7, "30d": 30, "90d": 90 }[range] * 24 * 60 * 60 * 1000);

  const spanMs = now.getTime() - since.getTime();
  const prevUntil = since;
  const prevSince = new Date(since.getTime() - spanMs);

  return { since, prevSince, prevUntil };
}

/** Percent change, current vs previous, rounded to one decimal. Null
 * (not Infinity/NaN) when the previous period had nothing to compare
 * against — an honest "no meaningful comparison" rather than a
 * fabricated number. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** A funnel conversion rate as a percentage, rounded to one decimal.
 * Null when the denominator is 0 — there's nothing to convert from. */
export function ratePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
