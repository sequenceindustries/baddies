import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { getPublicCreatorProfile, resolveCreatorCanonicalPath } from "@/lib/creator/public-profile";

/**
 * SEO Phase 3 — getPublicCreatorProfile now backs BOTH GET /api/
 * creators/[id] and the server-rendered profile page directly, so this
 * one test suite covers both consumers at once. Requires a real
 * Postgres connection — skipped automatically if none is reachable,
 * same pattern as every other integration test here.
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

describe.skipIf(!dbAvailable)("getPublicCreatorProfile (integration)", () => {
  const cleanupUserIds: string[] = [];

  afterAll(async () => {
    for (const id of cleanupUserIds) {
      await db.user.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeCreator(overrides: {
    status?: "PENDING" | "VERIFIED" | "REJECTED";
    handle?: string | null;
    locationVisible?: boolean;
    subscriberCountVisible?: boolean;
    bio?: string;
    city?: string;
    country?: string;
  }) {
    const email = `public-profile-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const user = await db.user.create({
      data: {
        email,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: {
          create: {
            displayName: "Public Profile Test Creator",
            bio: overrides.bio ?? "A real bio for testing.",
            city: overrides.city ?? "Cape Town",
            country: overrides.country ?? "South Africa",
          },
        },
        wallet: { create: {} },
      },
    });
    cleanupUserIds.push(user.id);
    const creatorProfile = await db.creatorProfile.create({
      data: {
        userId: user.id,
        status: overrides.status ?? "VERIFIED",
        handle: overrides.handle ?? null,
        locationVisible: overrides.locationVisible ?? true,
        subscriberCountVisible: overrides.subscriberCountVisible ?? false,
      },
    });
    return creatorProfile;
  }

  it("returns the public shell for a VERIFIED creator, resolved by cuid", async () => {
    const creator = await makeCreator({});
    const result = await getPublicCreatorProfile(creator.id);
    expect(result).not.toBeNull();
    expect(result?.creatorProfileId).toBe(creator.id);
    expect(result?.displayName).toBe("Public Profile Test Creator");
    expect(result?.bio).toBe("A real bio for testing.");
    expect(result?.verifiedBadge).toBe(true);
  });

  it("resolves the same creator by handle", async () => {
    const handle = `handletest${Date.now().toString(36)}`.slice(0, 20);
    const creator = await makeCreator({ handle });
    const byHandle = await getPublicCreatorProfile(handle);
    const byId = await getPublicCreatorProfile(creator.id);
    expect(byHandle?.creatorProfileId).toBe(creator.id);
    expect(byId?.creatorProfileId).toBe(creator.id);
  });

  it("returns null for a PENDING creator (never leaks unverified applicants)", async () => {
    const creator = await makeCreator({ status: "PENDING" });
    const result = await getPublicCreatorProfile(creator.id);
    expect(result).toBeNull();
  });

  it("returns null for a REJECTED creator", async () => {
    const creator = await makeCreator({ status: "REJECTED" });
    const result = await getPublicCreatorProfile(creator.id);
    expect(result).toBeNull();
  });

  it("returns null for a nonexistent id or handle", async () => {
    expect(await getPublicCreatorProfile("cnonexistentcuidvalue000")).toBeNull();
    expect(await getPublicCreatorProfile("nosuchhandle")).toBeNull();
  });

  it("hides city/country when locationVisible is false, shows them when true", async () => {
    const hidden = await makeCreator({ locationVisible: false });
    const shown = await makeCreator({ locationVisible: true });
    const hiddenResult = await getPublicCreatorProfile(hidden.id);
    const shownResult = await getPublicCreatorProfile(shown.id);
    expect(hiddenResult?.city).toBeNull();
    expect(hiddenResult?.country).toBeNull();
    expect(shownResult?.city).toBe("Cape Town");
    expect(shownResult?.country).toBe("South Africa");
  });

  it("only includes subscriberCount when subscriberCountVisible is true", async () => {
    const hidden = await makeCreator({ subscriberCountVisible: false });
    const shown = await makeCreator({ subscriberCountVisible: true });
    const hiddenResult = await getPublicCreatorProfile(hidden.id);
    const shownResult = await getPublicCreatorProfile(shown.id);
    expect(hiddenResult?.subscriberCount).toBeUndefined();
    expect(typeof shownResult?.subscriberCount).toBe("number");
  });
});

describe("resolveCreatorCanonicalPath", () => {
  it("prefers the handle when set", () => {
    expect(resolveCreatorCanonicalPath({ creatorProfileId: "cabc123", handle: "zoe" })).toBe("/creators/zoe");
  });

  it("falls back to the cuid when no handle is set", () => {
    expect(resolveCreatorCanonicalPath({ creatorProfileId: "cabc123", handle: null })).toBe("/creators/cabc123");
  });
});
