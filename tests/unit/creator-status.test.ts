import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, canMonetise, InvalidTransitionError } from "@/lib/creator/status";

describe("creator status state machine", () => {
  it("allows the happy path through to VERIFIED", () => {
    expect(canTransition("PENDING", "VERIFICATION_REQUIRED")).toBe(true);
    expect(canTransition("VERIFICATION_REQUIRED", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "VERIFIED")).toBe(true);
  });

  it("rejects skipping straight from PENDING to VERIFIED", () => {
    expect(canTransition("PENDING", "VERIFIED")).toBe(false);
  });

  it("rejects any transition out of BANNED", () => {
    expect(canTransition("BANNED", "VERIFIED")).toBe(false);
    expect(canTransition("BANNED", "SUSPENDED")).toBe(false);
  });

  it("allows a rejected creator to re-apply via VERIFICATION_REQUIRED", () => {
    expect(canTransition("REJECTED", "VERIFICATION_REQUIRED")).toBe(true);
  });

  it("allows suspending and reinstating a verified creator", () => {
    expect(canTransition("VERIFIED", "SUSPENDED")).toBe(true);
    expect(canTransition("SUSPENDED", "VERIFIED")).toBe(true);
  });

  it("assertTransition throws InvalidTransitionError on an illegal move", () => {
    expect(() => assertTransition("PENDING", "VERIFIED")).toThrow(InvalidTransitionError);
  });

  it("assertTransition does not throw on a legal move", () => {
    expect(() => assertTransition("PENDING", "VERIFICATION_REQUIRED")).not.toThrow();
  });

  it("only VERIFIED creators can monetise", () => {
    expect(canMonetise("VERIFIED")).toBe(true);
    for (const status of ["PENDING", "VERIFICATION_REQUIRED", "UNDER_REVIEW", "SUSPENDED", "REJECTED", "BANNED"] as const) {
      expect(canMonetise(status)).toBe(false);
    }
  });
});
