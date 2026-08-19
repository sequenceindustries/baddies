import { describe, it, expect } from "vitest";
import {
  canTransitionContent,
  assertContentTransition,
  isPubliclyVisible,
  InvalidContentTransitionError,
} from "@/lib/content/status";

describe("content status state machine", () => {
  it("allows the happy path from DRAFT to APPROVED (no mandatory moderation queue)", () => {
    expect(canTransitionContent("DRAFT", "UPLOADED")).toBe(true);
    expect(canTransitionContent("UPLOADED", "PROCESSING")).toBe(true);
    expect(canTransitionContent("PROCESSING", "APPROVED")).toBe(true);
  });

  it("still allows PENDING_REVIEW -> APPROVED for a report-triggered re-review, just not as part of upload", () => {
    expect(canTransitionContent("PENDING_REVIEW", "APPROVED")).toBe(true);
  });

  it("rejects skipping straight from DRAFT to APPROVED", () => {
    expect(canTransitionContent("DRAFT", "APPROVED")).toBe(false);
  });

  it("rejects any transition out of REMOVED", () => {
    expect(canTransitionContent("REMOVED", "APPROVED")).toBe(false);
    expect(canTransitionContent("REMOVED", "PENDING_REVIEW")).toBe(false);
  });

  it("allows a rejected item to be resubmitted for review", () => {
    expect(canTransitionContent("REJECTED", "PENDING_REVIEW")).toBe(true);
  });

  it("allows an approved item to be pulled back for re-review or removed", () => {
    expect(canTransitionContent("APPROVED", "PENDING_REVIEW")).toBe(true);
    expect(canTransitionContent("APPROVED", "REMOVED")).toBe(true);
  });

  it("assertContentTransition throws on an illegal move", () => {
    expect(() => assertContentTransition("DRAFT", "APPROVED")).toThrow(InvalidContentTransitionError);
  });

  it("only APPROVED content is publicly visible", () => {
    expect(isPubliclyVisible("APPROVED")).toBe(true);
    for (const status of ["DRAFT", "UPLOADED", "PROCESSING", "PENDING_REVIEW", "REJECTED", "REMOVED"] as const) {
      expect(isPubliclyVisible(status)).toBe(false);
    }
  });
});
