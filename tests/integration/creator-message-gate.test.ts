import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";

/**
 * Integration test for the two gates POST /api/creators/
 * [creatorProfileId]/message applies before writing a Message row:
 * (1) the creator must have CreatorProfile.acceptsMessages, (2) the fan
 * must have a real, currently-active subscription — the exact same
 * query shape canAccessContent uses (src/lib/entitlements/content.ts).
 * Exercises the real schema/query directly rather than the route
 * handler itself (no established pattern in this codebase for invoking
 * a route handler's auth/session layer from a test — see
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

async function hasActiveSubscription(fanId: string, creatorProfileId: string): Promise<boolean> {
  const sub = await db.subscription.findFirst({
    where: { fanId, creatorProfileId, status: "ACTIVE", currentPeriodEnd: { gte: new Date() } },
    select: { id: true },
  });
  return sub !== null;
}

describe.skipIf(!dbAvailable)("creator message gate (integration)", () => {
  it("an unsubscribed fan fails the subscription gate; a real active subscription passes it", async () => {
    const fan = await db.user.create({
      data: { email: `msg-gate-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creatorUser = await db.user.create({
      data: {
        email: `msg-gate-creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Message Gate Test Creator" } },
      },
    });
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });

    expect(await hasActiveSubscription(fan.id, creatorProfile.id)).toBe(false);

    const subscription = await db.subscription.create({
      data: {
        fanId: fan.id,
        creatorProfileId: creatorProfile.id,
        status: "ACTIVE",
        priceUsdAtPurchase: 9.99,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await hasActiveSubscription(fan.id, creatorProfile.id)).toBe(true);

    // A subscription whose period has already lapsed must not count,
    // even if `status` is still nominally "ACTIVE" (matches the exact
    // reasoning that motivated fixing GET /api/messages/creators's own
    // looser status-only check in the same change).
    await db.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    expect(await hasActiveSubscription(fan.id, creatorProfile.id)).toBe(false);

    await db.subscription.deleteMany({ where: { fanId: fan.id } });
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
    await db.user.delete({ where: { id: fan.id } });
  });

  it("defaults acceptsMessages to true for a new creator (preserves today's fully-open behavior)", async () => {
    const creatorUser = await db.user.create({
      data: {
        email: `msg-gate-default-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Default Accepts Messages Test" } },
      },
    });
    const creatorProfile = await db.creatorProfile.create({ data: { userId: creatorUser.id, status: "VERIFIED" } });
    expect(creatorProfile.acceptsMessages).toBe(true);

    const optedOut = await db.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: { acceptsMessages: false },
    });
    expect(optedOut.acceptsMessages).toBe(false);

    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: creatorUser.id } });
  });
});
