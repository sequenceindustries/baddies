import { describe, it, expect } from "vitest";
import { advanceFoundingStatus } from "@/lib/founding/pipeline";

describe("advanceFoundingStatus", () => {
  it("advances forward from an earlier stage", () => {
    expect(advanceFoundingStatus("APPLIED", "CONTACT_CONFIRMED")).toBe("CONTACT_CONFIRMED");
    expect(advanceFoundingStatus("APPLIED", "IDENTITY_SUBMITTED")).toBe("IDENTITY_SUBMITTED");
    expect(advanceFoundingStatus("CONTACT_CONFIRMED", "IDENTITY_SUBMITTED")).toBe("IDENTITY_SUBMITTED");
    expect(advanceFoundingStatus("APPROVED", "ONBOARDING")).toBe("ONBOARDING");
    expect(advanceFoundingStatus("IDENTITY_SUBMITTED", "ONBOARDING")).toBe("ONBOARDING");
  });

  it("never regresses an application that's already further along", () => {
    expect(advanceFoundingStatus("VERIFIED", "CONTACT_CONFIRMED")).toBe("VERIFIED");
    expect(advanceFoundingStatus("APPROVED", "IDENTITY_SUBMITTED")).toBe("APPROVED");
    expect(advanceFoundingStatus("LIVE", "CONTACT_CONFIRMED")).toBe("LIVE");
    expect(advanceFoundingStatus("LIVE", "ONBOARDING")).toBe("LIVE");
  });

  it("is a no-op when already exactly at the reached stage", () => {
    expect(advanceFoundingStatus("IDENTITY_SUBMITTED", "IDENTITY_SUBMITTED")).toBe("IDENTITY_SUBMITTED");
    expect(advanceFoundingStatus("ONBOARDING", "ONBOARDING")).toBe("ONBOARDING");
  });

  it("never moves a rejected application back into the active pipeline", () => {
    expect(advanceFoundingStatus("REJECTED", "CONTACT_CONFIRMED")).toBe("REJECTED");
    expect(advanceFoundingStatus("REJECTED", "IDENTITY_SUBMITTED")).toBe("REJECTED");
    expect(advanceFoundingStatus("REJECTED", "ONBOARDING")).toBe("REJECTED");
  });
});
