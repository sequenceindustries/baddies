import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { getLocationCreators, getLocationConfig, LOCATIONS } from "@/lib/discovery/locations";

/**
 * SEO Phase 5 — curated location pages. Requires a real Postgres
 * connection — skipped automatically if none is reachable.
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

describe("getLocationConfig / LOCATIONS", () => {
  it("has exactly the 4 curated locations named in the plan", () => {
    expect(LOCATIONS.map((l) => l.slug).sort()).toEqual(["cape-town", "durban", "johannesburg", "south-africa"]);
  });

  it("returns undefined for an unconfigured slug", () => {
    expect(getLocationConfig("nowhere-real")).toBeUndefined();
  });

  it("matches known real-world aliases for each city (case-insensitive)", () => {
    const johannesburg = getLocationConfig("johannesburg")!;
    for (const alias of ["Johannesburg", "JOBURG", "jhb", "Jozi"]) {
      expect(johannesburg.matches({ city: alias, country: null })).toBe(true);
    }
    expect(johannesburg.matches({ city: "Cape Town", country: null })).toBe(false);

    const capeTown = getLocationConfig("cape-town")!;
    expect(capeTown.matches({ city: "Cape Town", country: null })).toBe(true);
    expect(capeTown.matches({ city: "CPT", country: null })).toBe(true);

    const southAfrica = getLocationConfig("south-africa")!;
    expect(southAfrica.matches({ city: null, country: "South Africa" })).toBe(true);
    expect(southAfrica.matches({ city: null, country: "United Kingdom" })).toBe(false);
  });
});

describe.skipIf(!dbAvailable)("getLocationCreators (integration)", () => {
  const cleanupUserIds: string[] = [];

  afterAll(async () => {
    for (const id of cleanupUserIds) {
      await db.creatorProfile.deleteMany({ where: { userId: id } });
      await db.user.deleteMany({ where: { id } });
    }
  });

  async function makeCreator(city: string, country: string, locationVisible = true) {
    const email = `location-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const user = await db.user.create({
      data: {
        email,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Location Test Creator", city, country } },
      },
    });
    cleanupUserIds.push(user.id);
    await db.creatorProfile.create({ data: { userId: user.id, status: "VERIFIED", locationVisible } });
    return user.id;
  }

  it("returns null for an unconfigured slug", async () => {
    expect(await getLocationCreators("nowhere-real")).toBeNull();
  });

  it("matches a creator whose city is a known alias, and flips indexable once the threshold is cleared", async () => {
    // Below threshold (default minCreatorsToIndex is 3): 1 real match.
    await makeCreator("Joburg", "South Africa");
    const belowThreshold = await getLocationCreators("johannesburg");
    expect(belowThreshold).not.toBeNull();
    expect(belowThreshold!.creators.length).toBeGreaterThanOrEqual(1);
    expect(belowThreshold!.indexable).toBe(false);

    // Clear the threshold with 2 more real matches (3 total).
    await makeCreator("JHB", "South Africa");
    await makeCreator("Johannesburg", "South Africa");
    const atThreshold = await getLocationCreators("johannesburg");
    expect(atThreshold!.creators.length).toBeGreaterThanOrEqual(3);
    expect(atThreshold!.indexable).toBe(true);
  });

  it("excludes a creator who opted out of locationVisible, even with a matching city", async () => {
    await makeCreator("Durban", "South Africa", false);
    const result = await getLocationCreators("durban");
    expect(result!.creators.some((c) => c.displayName === "Location Test Creator")).toBe(false);
  });
});
