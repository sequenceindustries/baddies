import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { selectDisplayPerPosition } from "@/lib/media/carousel";

/**
 * Integration test for carousel storage: a Content row with multiple
 * ordered MediaAsset positions, read back correctly via the same
 * position-ordering + selectDisplayPerPosition logic
 * GET /api/content/[contentId]/media uses. Exercises the real schema
 * (MediaAsset.position + its composite index) and Prisma queries
 * directly — this codebase has no established pattern for invoking a
 * Next.js route handler's auth/session layer from a test, so the
 * upload route's own Zod validation (item cap, per-item image decode)
 * is covered by live browser verification instead, per this project's
 * standing practice for new routes.
 *
 * Requires a real Postgres connection — skipped automatically if none
 * is reachable, same pattern as every other integration test here.
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

describe.skipIf(!dbAvailable)("carousel media storage (integration)", () => {
  it("stores and retrieves multiple ordered MediaAsset positions, preferring DISPLAY per slide", async () => {
    const user = await db.user.create({
      data: {
        email: `carousel-test-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Carousel Test Creator" } },
        wallet: { create: {} },
      },
    });
    const creatorProfile = await db.creatorProfile.create({
      data: { userId: user.id, status: "VERIFIED" },
    });

    const content = await db.content.create({
      data: {
        creatorProfileId: creatorProfile.id,
        mediaType: "IMAGE", // position 0's type, matching the real upload route's convention
        accessLevel: "FREE",
        status: "APPROVED",
        moderationStatus: "APPROVED",
        publishedAt: new Date(),
      },
    });

    // Slide 0: image with both ORIGINAL + DISPLAY (the common case).
    // Slide 1: video, ORIGINAL only (no sharp pipeline for video).
    // Slide 2: image with ORIGINAL + DISPLAY again.
    await db.mediaAsset.createMany({
      data: [
        { contentId: content.id, storageProvider: "stub", storageKey: "k0-orig", mimeType: "image/jpeg", kind: "ORIGINAL", position: 0 },
        { contentId: content.id, storageProvider: "stub", storageKey: "k0-display", mimeType: "image/webp", kind: "DISPLAY", position: 0 },
        { contentId: content.id, storageProvider: "stub", storageKey: "k1-orig", mimeType: "video/mp4", kind: "ORIGINAL", position: 1 },
        { contentId: content.id, storageProvider: "stub", storageKey: "k2-display", mimeType: "image/webp", kind: "DISPLAY", position: 2 },
        { contentId: content.id, storageProvider: "stub", storageKey: "k2-orig", mimeType: "image/jpeg", kind: "ORIGINAL", position: 2 },
      ],
    });

    const fetched = await db.mediaAsset.findMany({
      where: { contentId: content.id },
      orderBy: { position: "asc" },
    });
    expect(fetched).toHaveLength(5);

    const chosen = selectDisplayPerPosition(fetched);
    expect(chosen.map((a) => a.storageKey)).toEqual(["k0-display", "k1-orig", "k2-display"]);
    expect(chosen.map((a) => a.position)).toEqual([0, 1, 2]);

    // cleanup
    await db.mediaAsset.deleteMany({ where: { contentId: content.id } });
    await db.content.delete({ where: { id: content.id } });
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: user.id } });
  });

  it("defaults existing/plain rows to position 0", async () => {
    const user = await db.user.create({
      data: {
        email: `carousel-legacy-test-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Legacy Post Test Creator" } },
        wallet: { create: {} },
      },
    });
    const creatorProfile = await db.creatorProfile.create({
      data: { userId: user.id, status: "VERIFIED" },
    });
    const content = await db.content.create({
      data: {
        creatorProfileId: creatorProfile.id,
        mediaType: "IMAGE",
        accessLevel: "FREE",
        status: "APPROVED",
        moderationStatus: "APPROVED",
        publishedAt: new Date(),
      },
    });
    // No explicit position — must default to 0, same as every
    // pre-carousel-migration row.
    const asset = await db.mediaAsset.create({
      data: { contentId: content.id, storageProvider: "stub", storageKey: "legacy-key", mimeType: "image/jpeg", kind: "ORIGINAL" },
    });
    expect(asset.position).toBe(0);

    await db.mediaAsset.deleteMany({ where: { contentId: content.id } });
    await db.content.delete({ where: { id: content.id } });
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
