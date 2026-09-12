import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeSubscriptionRecognition, type RecognitionSourceEntry } from "@/lib/ledger/service";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const FAR_PAST = new Date(0); // settlementCutoff that never holds anything back, for recognizedAmount-only assertions

function entry(creatorShareAmount: number, durationMonths: number, recognitionStartAt: Date): RecognitionSourceEntry {
  return {
    creatorShareAmount: new Prisma.Decimal(creatorShareAmount),
    grossAmount: new Prisma.Decimal(creatorShareAmount),
    durationMonths,
    recognitionStartAt,
    createdAt: recognitionStartAt,
  };
}

describe("computeSubscriptionRecognition — progressive earnings accrual", () => {
  it("a 1-month package recognizes the full amount immediately (no behavior change from pre-redesign)", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const result = computeSubscriptionRecognition(entry(80, 1, start), start, FAR_PAST);
    expect(result.recognizedAmount).toBe(80);
    expect(result.scheduledAmount).toBe(0);
  });

  it.each([
    { durationMonths: 3, totalAmount: 240 },
    { durationMonths: 6, totalAmount: 480 },
    { durationMonths: 12, totalAmount: 960 },
  ])(
    "a $durationMonths-month package recognizes exactly 1/$durationMonths at t=0, and everything by the final month",
    ({ durationMonths, totalAmount }) => {
      const start = new Date("2026-01-01T00:00:00Z");

      // t = 0: only month 1 is recognized.
      const atStart = computeSubscriptionRecognition(entry(totalAmount, durationMonths, start), start, FAR_PAST);
      expect(atStart.recognizedAmount).toBeCloseTo(totalAmount / durationMonths, 2);
      expect(atStart.recognizedAmount + atStart.scheduledAmount).toBeCloseTo(totalAmount, 2);

      // t = +1 month: exactly 2 installments recognized (or fully
      // recognized, for the 1-month-equivalent edge case — not reached
      // here since durationMonths >= 3).
      const plusOneMonth = computeSubscriptionRecognition(
        entry(totalAmount, durationMonths, start),
        new Date(start.getTime() + MONTH_MS),
        FAR_PAST
      );
      expect(plusOneMonth.recognizedAmount).toBeCloseTo((totalAmount / durationMonths) * 2, 2);

      // t = +durationMonths months + 1 day: fully recognized, no
      // rounding dust left in the scheduled bucket.
      const afterFull = computeSubscriptionRecognition(
        entry(totalAmount, durationMonths, start),
        new Date(start.getTime() + durationMonths * MONTH_MS + 24 * 60 * 60 * 1000),
        FAR_PAST
      );
      expect(afterFull.recognizedAmount).toBe(totalAmount);
      expect(afterFull.scheduledAmount).toBe(0);
    }
  );

  it("recognized + scheduled always sums to the entry's total amount, even with rounding-unfriendly splits", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    // 100 / 3 = 33.33... — exercises the rounding-remainder-on-last-installment path.
    const totalAmount = 100;
    const durationMonths = 3;

    for (const monthsElapsed of [0, 1, 2, 3, 4]) {
      const now = new Date(start.getTime() + monthsElapsed * MONTH_MS);
      const result = computeSubscriptionRecognition(entry(totalAmount, durationMonths, start), now, FAR_PAST);
      expect(result.recognizedAmount + result.scheduledAmount).toBeCloseTo(totalAmount, 2);
    }
  });

  it("pending vs available within the recognized amount is keyed off each installment's own recognition date, not the entry's createdAt", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const totalAmount = 300; // 100/month over 3 months
    const now = new Date(start.getTime() + MONTH_MS); // month 2 just recognized
    // A 3-day settlement hold as of `now`: month 1 (recognized 30 days
    // ago) has cleared the hold; month 2 (recognized today) has not.
    const settlementCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const result = computeSubscriptionRecognition(entry(totalAmount, 3, start), now, settlementCutoff);
    expect(result.availableAmount).toBeCloseTo(100, 2); // month 1
    expect(result.pendingAmount).toBeCloseTo(100, 2); // month 2
    expect(result.scheduledAmount).toBeCloseTo(100, 2); // month 3, not yet recognized at all
  });

  it("a mid-period refund only reverses the unrecognized (scheduled) portion — recognized months are excluded by construction", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const totalAmount = 300; // 100/month over 3 months
    const oneMonthIn = new Date(start.getTime() + MONTH_MS);

    const result = computeSubscriptionRecognition(entry(totalAmount, 3, start), oneMonthIn, FAR_PAST);
    // 2 of 3 months recognized (200); only the 3rd month's 100 is
    // still reversible — a refund request for the full 300 can only
    // ever claw back 100.
    expect(result.recognizedAmount).toBeCloseTo(200, 2);
    expect(result.scheduledAmount).toBeCloseTo(100, 2);
  });
});
