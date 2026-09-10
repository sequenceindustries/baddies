import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

/**
 * Integration test for the Block model and the bidirectional-check
 * query shape POST /api/creators/[creatorProfileId]/message and
 * .../follow both use before allowing a message/follow: `db.block
 * .findFirst({where:{OR:[{blockerId:A,blockedUserId:B},{blockerId:B,
 * blockedUserId:A}]}})` — a block in EITHER direction must count.
 * Also covers the block route's own P2002-idempotent create (repeat
 * block, same pattern as follow's own duplicate guard) and that
 * blocking removes any existing Follow row.
 *
 * Exercises the real schema/query directly rather than the route
 * handlers themselves (no established pattern in this codebase for
 * invoking a route handler's auth/session layer from a test — see
 * tests/integration/carousel-upload.test.ts's own comment on this).
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

async function isBlockedEitherDirection(a: string, b: string): Promise<boolean> {
  const found = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedUserId: b },
        { blockerId: b, blockedUserId: a },
      ],
    },
    select: { id: true },
  });
  return found !== null;
}

describe.skipIf(!dbAvailable)("creator block enforcement (integration)", () => {
  it("a block in either direction is found by the bidirectional check; no block means not found", async () => {
    const fan = await db.user.create({
      data: { email: `block-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creatorUser = await db.user.create({
      data: {
        email: `block-creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Block Test Creator" } },
      },
    });

    expect(await isBlockedEitherDirection(fan.id, creatorUser.id)).toBe(false);

    // Fan blocks the creator (the real direction the "•••" menu writes).
    await db.block.create({ data: { blockerId: fan.id, blockedUserId: creatorUser.id } });
    expect(await isBlockedEitherDirection(fan.id, creatorUser.id)).toBe(true);
    // Order-independent — checking (creator, fan) must also find it.
    expect(await isBlockedEitherDirection(creatorUser.id, fan.id)).toBe(true);

    await db.block.deleteMany({ where: { blockerId: fan.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
    await db.user.delete({ where: { id: fan.id } });
  });

  it("a repeat block create throws P2002 (idempotent, matching follow's own guard)", async () => {
    const fan = await db.user.create({
      data: { email: `block-dup-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creatorUser = await db.user.create({
      data: {
        email: `block-dup-creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Block Dup Test Creator" } },
      },
    });

    await db.block.create({ data: { blockerId: fan.id, blockedUserId: creatorUser.id } });

    let caughtAsDuplicate = false;
    try {
      await db.block.create({ data: { blockerId: fan.id, blockedUserId: creatorUser.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        caughtAsDuplicate = true;
      } else {
        throw err;
      }
    }
    expect(caughtAsDuplicate).toBe(true);

    await db.block.deleteMany({ where: { blockerId: fan.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
    await db.user.delete({ where: { id: fan.id } });
  });

  it("blocking removes any existing Follow row (matches the block route's own behavior)", async () => {
    const fan = await db.user.create({
      data: { email: `block-follow-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creatorUser = await db.user.create({
      data: {
        email: `block-follow-creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Block Follow Test Creator" } },
      },
    });
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });

    await db.follow.create({ data: { fanId: fan.id, creatorProfileId: creatorProfile.id } });
    expect(await db.follow.count({ where: { fanId: fan.id, creatorProfileId: creatorProfile.id } })).toBe(1);

    // Same two writes the block route performs in one request.
    await db.block.create({ data: { blockerId: fan.id, blockedUserId: creatorUser.id } });
    await db.follow.deleteMany({ where: { fanId: fan.id, creatorProfileId: creatorProfile.id } });

    expect(await db.follow.count({ where: { fanId: fan.id, creatorProfileId: creatorProfile.id } })).toBe(0);

    await db.block.deleteMany({ where: { blockerId: fan.id } });
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
    await db.user.delete({ where: { id: fan.id } });
  });
});
