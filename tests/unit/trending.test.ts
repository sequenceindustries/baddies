import { describe, it, expect } from "vitest";
import { aggregateTrendingScores } from "@/lib/discovery/trending-score";

describe("aggregateTrendingScores", () => {
  it("sums consumption counts per content", () => {
    const result = aggregateTrendingScores(
      [
        { contentId: "a", count: 5 },
        { contentId: "b", count: 2 },
      ],
      []
    );
    expect(result).toEqual([
      { contentId: "a", score: 5 },
      { contentId: "b", score: 2 },
    ]);
  });

  it("weights purchases higher than qualifying consumption by the given factor", () => {
    const result = aggregateTrendingScores([{ contentId: "a", count: 1 }], [{ contentId: "a", count: 1 }], 3);
    expect(result).toEqual([{ contentId: "a", score: 4 }]); // 1 consumption + (1 purchase * 3)
  });

  it("sorts descending by score", () => {
    const result = aggregateTrendingScores(
      [
        { contentId: "low", count: 1 },
        { contentId: "high", count: 10 },
      ],
      []
    );
    expect(result.map((r) => r.contentId)).toEqual(["high", "low"]);
  });

  it("combines counts across both signal types for the same content", () => {
    const result = aggregateTrendingScores(
      [{ contentId: "a", count: 2 }],
      [{ contentId: "a", count: 1 }],
      2
    );
    expect(result).toEqual([{ contentId: "a", score: 4 }]); // 2 + (1 * 2)
  });
});
