import { describe, it, expect } from "vitest";
import { selectDisplayPerPosition } from "@/lib/media/carousel";

describe("selectDisplayPerPosition", () => {
  it("sorts by position and prefers DISPLAY within each position, from scrambled input", () => {
    const result = selectDisplayPerPosition([
      { id: "p2-orig", kind: "ORIGINAL", position: 2 },
      { id: "p0-display", kind: "DISPLAY", position: 0 },
      { id: "p1-orig", kind: "ORIGINAL", position: 1 },
      { id: "p0-orig", kind: "ORIGINAL", position: 0 },
      { id: "p2-display", kind: "DISPLAY", position: 2 },
    ] as const);

    expect(result.map((a) => a.id)).toEqual(["p0-display", "p1-orig", "p2-display"]);
  });

  it("falls back to ORIGINAL when a position has no DISPLAY asset", () => {
    const result = selectDisplayPerPosition([{ id: "video", kind: "ORIGINAL", position: 0 }] as const);
    expect(result.map((a) => a.id)).toEqual(["video"]);
  });

  it("returns exactly one asset per distinct position, never more", () => {
    const result = selectDisplayPerPosition([
      { id: "a", kind: "ORIGINAL", position: 0 },
      { id: "b", kind: "DISPLAY", position: 0 },
    ] as const);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b");
  });

  it("returns an empty array for empty input", () => {
    expect(selectDisplayPerPosition([])).toEqual([]);
  });
});
