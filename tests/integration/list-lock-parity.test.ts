import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import type { Content } from "@prisma/client";
import { canAccessContent } from "@/lib/entitlements/content";
import { buildViewerLockContext, computeLockState } from "@/lib/entitlements/list-lock";

/**
 * Integration test (real Postgres) cross-checking list-lock.ts's
 * display-only mirror against the real, authoritative canAccessContent
 * for real rows — the two are maintained separately (see list-lock.ts's
 * own comment on why canAccessContent itself is never touched), so
 * nothing but this test catches them drifting apart. If this test ever
 * fails after a change to canAccessContent's rules, list-lock.ts needs
 * the same change made to it.
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

describe.skipIf(!dbAvailable)("list-lock vs. canAccessContent parity (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupCreatorUserIds: string[] = [];
  const cleanupContentIds: string[] = [];

  afterAll(async () => {
    for (const contentId of cleanupContentIds) {
      await db.content.deleteMany({ where: { id: contentId } });
    }
    for (const userId of cleanupCreatorUserIds) {
      await db.creatorProfile.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    for (const userId of cleanupUserIds) {
      await db.subscription.deleteMany({ where: { fanId: userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
  });

  async function createCreator(suffix: string, unlimitedOptedIn = false) {
    const user = await db.user.create({
      data: { email: `list-lock-creator-${suffix}@example.test`, passwordHash: "x", role: "CREATOR" },
    });
    cleanupCreatorUserIds.push(user.id);
    const creatorProfile = await db.creatorProfile.create({
      data: { userId: user.id, status: "VERIFIED", unlimitedOptedIn },
    });
    return creatorProfile;
  }

  async function createContent(creatorProfileId: string, accessLevel: "FREE" | "VIP" | "VVIP") {
    const content = await db.content.create({
      data: {
        creatorProfileId,
        mediaType: "IMAGE",
        accessLevel,
        status: "APPROVED",
        publishedAt: new Date(),
      },
    });
    cleanupContentIds.push(content.id);
    return content;
  }

  async function createFan(suffix: string) {
    const user = await db.user.create({
      data: { email: `list-lock-fan-${suffix}@example.test`, passwordHash: "x", role: "FAN" },
    });
    cleanupUserIds.push(user.id);
    return user;
  }

  async function assertParity(
    fan: { id: string; role: "FAN" | "ADMIN" },
    content: Pick<Content, "id" | "creatorProfileId" | "accessLevel" | "status" | "publishedAt">,
    creatorUnlimitedOptedIn: boolean
  ) {
    const [authoritative, ctx] = await Promise.all([
      canAccessContent(fan, content),
      buildViewerLockContext(fan),
    ]);
    const display = computeLockState(
      {
        creatorProfileId: content.creatorProfileId,
        accessLevel: content.accessLevel,
        status: content.status,
        publishedAt: content.publishedAt,
        creatorUnlimitedOptedIn,
      },
      ctx
    );
    expect(display.locked).toBe(!authoritative.allowed);
  }

  it("VIP content: an active VVIP subscriber to that creator agrees unlocked on both sides", async () => {
    const creator = await createCreator(`${Date.now()}-a`);
    const content = await createContent(creator.id, "VIP");
    const fan = await createFan(`${Date.now()}-a`);
    await db.subscription.create({
      data: {
        fanId: fan.id,
        creatorProfileId: creator.id,
        priceUsdAtPurchase: 9.99,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await assertParity({ id: fan.id, role: "FAN" }, content, false);
  });

  it("VVIP content: a subscriber to a DIFFERENT creator agrees locked on both sides", async () => {
    const creatorA = await createCreator(`${Date.now()}-b1`);
    const creatorB = await createCreator(`${Date.now()}-b2`);
    const content = await createContent(creatorA.id, "VVIP");
    const fan = await createFan(`${Date.now()}-b`);
    await db.subscription.create({
      data: {
        fanId: fan.id,
        creatorProfileId: creatorB.id,
        priceUsdAtPurchase: 9.99,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await assertParity({ id: fan.id, role: "FAN" }, content, false);
  });

  it("VIP content, creator opted into VIP pass, fan holds an active VIP pass: agrees unlocked on both sides", async () => {
    const creator = await createCreator(`${Date.now()}-c`, true);
    const content = await createContent(creator.id, "VIP");
    const fan = await createFan(`${Date.now()}-c`);
    await db.unlimitedSubscription.create({
      data: { fanId: fan.id, priceUsdAtPurchase: 19.99, currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    await assertParity({ id: fan.id, role: "FAN" }, content, true);
    await db.unlimitedSubscription.deleteMany({ where: { fanId: fan.id } });
  });

  it("a plain signed-in fan with no entitlement at all agrees locked on both sides, for VIP and VVIP", async () => {
    const creator = await createCreator(`${Date.now()}-d`);
    const vip = await createContent(creator.id, "VIP");
    const vvip = await createContent(creator.id, "VVIP");
    const fan = await createFan(`${Date.now()}-d`);
    await assertParity({ id: fan.id, role: "FAN" }, vip, false);
    await assertParity({ id: fan.id, role: "FAN" }, vvip, false);
  });

  it("ADMIN agrees unlocked on both sides for VVIP content", async () => {
    const creator = await createCreator(`${Date.now()}-e`);
    const content = await createContent(creator.id, "VVIP");
    const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    await assertParity({ id: admin.id, role: "ADMIN" }, content, false);
  });
});
