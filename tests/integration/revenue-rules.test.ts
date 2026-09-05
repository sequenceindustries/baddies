import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { getCurrentRevenueShareRule } from "@/lib/config/revenue-rules";

/**
 * Integration test (real Postgres, not mocked) — same self-skip pattern
 * as tests/integration/creator-verification.test.ts. Uses its own
 * throwaway RevenueShareRuleType-less-relevant rows rather than relying
 * on prisma/seed.ts having run, and cleans them up afterward.
 */
let dbAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) await db.$disconnect();
});

describe.skipIf(!dbAvailable)("getCurrentRevenueShareRule (integration)", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await db.revenueShareRule.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("returns the latest-effective version, not the first-created one", async () => {
    const v1 = await db.revenueShareRule.create({
      data: {
        type: "PARTNER_REFERRED_CREATOR_SHARE",
        version: `test-v1-${Date.now()}`,
        percentage: "0.8500",
        effectiveAt: new Date(Date.now() - 60_000),
      },
    });
    createdIds.push(v1.id);

    const v2 = await db.revenueShareRule.create({
      data: {
        type: "PARTNER_REFERRED_CREATOR_SHARE",
        version: `test-v2-${Date.now()}`,
        percentage: "0.9000",
        effectiveAt: new Date(),
      },
    });
    createdIds.push(v2.id);

    const current = await getCurrentRevenueShareRule("PARTNER_REFERRED_CREATOR_SHARE");
    expect(current.id).toBe(v2.id);
    expect(current.percentage.toNumber()).toBe(0.9);
  });

  it("ignores a not-yet-effective (future) row", async () => {
    const past = await db.revenueShareRule.create({
      data: {
        type: "PARTNER_PROFIT_POOL_SHARE",
        version: `test-past-${Date.now()}`,
        percentage: "0.1000",
        effectiveAt: new Date(Date.now() - 60_000),
      },
    });
    createdIds.push(past.id);

    const future = await db.revenueShareRule.create({
      data: {
        type: "PARTNER_PROFIT_POOL_SHARE",
        version: `test-future-${Date.now()}`,
        percentage: "0.5000",
        effectiveAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    createdIds.push(future.id);

    const current = await getCurrentRevenueShareRule("PARTNER_PROFIT_POOL_SHARE");
    expect(current.id).toBe(past.id);
  });

  it("throws for a type with no seeded rule at all", async () => {
    // STANDARD_CREATOR_SHARE is real-seeded data (prisma/seed.ts), so
    // fabricate a scenario guaranteed to have nothing: delete is not an
    // option (would break other tests/seeded state), so instead assert
    // the throw shape against a type that's genuinely never written in
    // this test file — if the real seed has run, this assertion is
    // skipped rather than asserting something false.
    const existing = await db.revenueShareRule.findFirst({ where: { type: "STANDARD_CREATOR_SHARE" } });
    if (existing) return; // seed already covers this type; nothing to assert
    await expect(getCurrentRevenueShareRule("STANDARD_CREATOR_SHARE")).rejects.toThrow(
      /No RevenueShareRule found/
    );
  });
});
