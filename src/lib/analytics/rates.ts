/**
 * Shared rate-calculation helpers for the admin Command Centre
 * (period-over-period deltas, funnel conversion rates). Extracted out
 * of the route handler so the "0-denominator → null, never NaN/
 * Infinity" behavior is unit-tested directly rather than only
 * exercised incidentally through the API route.
 */

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
