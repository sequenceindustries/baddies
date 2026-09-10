import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

/**
 * Integration test for the exact duplicate-notification guard used in
 * POST /api/content/[contentId]/like and POST /api/creators/
 * [creatorProfileId]/follow: both routes swapped an idempotent `upsert`
 * for a plain `create` wrapped in a P2002 (unique constraint violation)
 * catch, so a repeat like/follow can be told apart from a genuinely new
 * one — only a genuinely new row should trigger createNotification.
 * Exercises the real schema/Prisma error shape directly (no established
 * pattern in this codebase for invoking a route handler's auth/session
 * layer from a test — see tests/integration/carousel-upload.test.ts's
 * own comment on this), not the route handlers themselves.
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

describe.skipIf(!dbAvailable)("duplicate-notification guard (integration)", () => {
  it("a repeat ContentLike create throws P2002, correctly identified as a duplicate not a new like", async () => {
    const fan = await db.user.create({
      data: { email: `dup-like-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creatorUser = await db.user.create({
      data: {
        email: `dup-like-creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Dup Like Test Creator" } },
      },
    });
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });
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

    // First like: a genuinely new row — must succeed with no error.
    await db.contentLike.create({ data: { fanId: fan.id, contentId: content.id } });

    // Second like (double-click/repeat POST): must throw P2002, and the
    // exact same instanceof+code check the route uses must identify it
    // as a duplicate, not rethrow it as an unexpected error.
    let caughtAsDuplicate = false;
    try {
      await db.contentLike.create({ data: { fanId: fan.id, contentId: content.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        caughtAsDuplicate = true;
      } else {
        throw err;
      }
    }
    expect(caughtAsDuplicate).toBe(true);

    // Still exactly one like row — the guard didn't let a duplicate
    // slip through as a second real row.
    const count = await db.contentLike.count({ where: { fanId: fan.id, contentId: content.id } });
    expect(count).toBe(1);

    await db.contentLike.deleteMany({ where: { contentId: content.id } });
    await db.content.delete({ where: { id: content.id } });
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
    await db.user.delete({ where: { id: fan.id } });
  });

  it("a repeat Follow create throws P2002, correctly identified as a duplicate not a new follow", async () => {
    const fan = await db.user.create({
      data: { email: `dup-follow-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creatorUser = await db.user.create({
      data: {
        email: `dup-follow-creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Dup Follow Test Creator" } },
      },
    });
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });

    await db.follow.create({ data: { fanId: fan.id, creatorProfileId: creatorProfile.id } });

    let caughtAsDuplicate = false;
    try {
      await db.follow.create({ data: { fanId: fan.id, creatorProfileId: creatorProfile.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        caughtAsDuplicate = true;
      } else {
        throw err;
      }
    }
    expect(caughtAsDuplicate).toBe(true);

    const count = await db.follow.count({ where: { fanId: fan.id, creatorProfileId: creatorProfile.id } });
    expect(count).toBe(1);

    await db.follow.deleteMany({ where: { creatorProfileId: creatorProfile.id } });
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
    await db.user.delete({ where: { id: fan.id } });
  });
});
