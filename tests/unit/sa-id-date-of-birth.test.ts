import { describe, it, expect } from "vitest";
import { parseSaIdDateOfBirth } from "@/lib/identity/sa-id";

describe("parseSaIdDateOfBirth", () => {
  it("reads a 1900s birthdate from the first 6 digits", () => {
    // YY=50 is safely > the current two-digit year for decades to come,
    // so this always resolves to 1950 regardless of when the test runs.
    expect(parseSaIdDateOfBirth("5003125800086")).toBe("1950-03-12");
  });

  it("reads a 2000s birthdate from the first 6 digits", () => {
    // YY=10 is safely <= the current two-digit year until 2110.
    expect(parseSaIdDateOfBirth("1011255800086")).toBe("2010-11-25");
  });

  it("strips whitespace before parsing", () => {
    expect(parseSaIdDateOfBirth(" 5003125800086 ")).toBe("1950-03-12");
  });

  it("handles a real leap-day birthdate", () => {
    expect(parseSaIdDateOfBirth("0402295800086")).toBe("2004-02-29");
  });

  it("rejects a non-existent leap day", () => {
    expect(parseSaIdDateOfBirth("0502295800086")).toBeNull(); // 2005 is not a leap year
  });

  it("rejects an invalid month", () => {
    expect(parseSaIdDateOfBirth("5013125800086")).toBeNull();
  });

  it("rejects anything that isn't exactly 13 digits", () => {
    expect(parseSaIdDateOfBirth("")).toBeNull();
    expect(parseSaIdDateOfBirth("5003125800")).toBeNull(); // too short — mid-typing
    expect(parseSaIdDateOfBirth("A9885140000AB")).toBeNull(); // a passport number, not an SA ID
  });
});
