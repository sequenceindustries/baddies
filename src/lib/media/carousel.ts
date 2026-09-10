export interface PositionedAsset {
  kind: "ORIGINAL" | "DISPLAY";
  position: number;
}

/**
 * Groups a Content's MediaAsset rows by carousel position and, within
 * each position, prefers the generated DISPLAY (WebP) asset over the
 * ORIGINAL upload — the same preference GET /api/content/[contentId]/
 * media has always applied, just scoped per-slide instead of globally
 * across the whole set (globally was only ever correct by accident,
 * back when a post had at most one slide). Returns exactly one asset
 * per distinct position, sorted by position ascending.
 *
 * Pure — no DB access, no I/O — kept separate from the route so the
 * grouping/preference logic is unit-testable on its own.
 */
export function selectDisplayPerPosition<T extends PositionedAsset>(assets: T[]): T[] {
  const byPosition = new Map<number, T[]>();
  for (const asset of assets) {
    const list = byPosition.get(asset.position) ?? [];
    list.push(asset);
    byPosition.set(asset.position, list);
  }
  return [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, list]) => list.find((a) => a.kind === "DISPLAY") ?? list[0]!);
}
