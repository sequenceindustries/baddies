import { describe, it, expect } from "vitest";
import { isStoryActive } from "@/lib/stories/active";

describe("isStoryActive", () => {
  it("returns false for no story at all", () => {
    expect(isStoryActive(null)).toBe(false);
  });

  it("returns true for a story whose expiry is in the future", () => {
    expect(isStoryActive({ expiresAt: new Date(Date.now() + 60_000) })).toBe(true);
  });

  it("returns false for a story whose expiry has already passed", () => {
    expect(isStoryActive({ expiresAt: new Date(Date.now() - 60_000) })).toBe(false);
  });

  it("accepts an expiresAt string as well as a Date", () => {
    expect(isStoryActive({ expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
  });
});
