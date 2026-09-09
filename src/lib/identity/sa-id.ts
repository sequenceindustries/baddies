/**
 * Reads a South African 13-digit ID number's first 6 digits (YYMMDD) and
 * returns the birthdate as "YYYY-MM-DD" for a date input, or null if
 * those digits don't form a real calendar date (a passport number, a
 * still-incomplete ID number mid-typing, etc.) — the century itself
 * isn't encoded in the number, so this uses the same two-digit-year
 * heuristic every SA ID parser does: a YY greater than the current
 * two-digit year is assumed to be 19XX, otherwise 20XX. It's an assist,
 * not a source of truth — the date field it feeds stays editable so
 * someone can correct it if the guess lands on the wrong century.
 *
 * Shared by both real verification flows that collect an SA ID number:
 * the Founding Baddies application's own identity step
 * (ApplicationNextSteps.tsx) and the real creator VerificationFlow
 * (components/verification-capture.tsx).
 */
export function parseSaIdDateOfBirth(idNumber: string): string | null {
  const digits = idNumber.replace(/\s/g, "");
  if (!/^\d{13}$/.test(digits)) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12) return null;

  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const year = century + yy;

  const parsed = new Date(Date.UTC(year, mm - 1, dd));
  const isRealDate =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === mm - 1 && parsed.getUTCDate() === dd;
  if (!isRealDate) return null;

  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
