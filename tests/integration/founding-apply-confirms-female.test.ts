import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { POST as foundingApply } from "@/app/api/founding/apply/route";

/**
 * Integration test (real Postgres) for the new confirmsFemale
 * eligibility declaration — "baddies creators are female only." Calls
 * the route's exported POST handler directly, same approach as
 * tests/integration/founding-apply-abuse-flags.test.ts.
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

function applyRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/founding/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseApplication(email: string, overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Female Policy Test",
    stageName: "FemalePolicyStage",
    email,
    password: "a-real-password-123",
    phone: "0820000002",
    country: "South Africa",
    city: "Cape Town",
    platforms: [{ category: "social", platform: "Instagram", handle: "@femalepolicy", link: "" }],
    confirmsAdult: true,
    confirmsFemale: true,
    agreesToVerification: true,
    ...overrides,
  };
}

describe.skipIf(!dbAvailable)("POST /api/founding/apply confirmsFemale eligibility (integration)", () => {
  const cleanupUserIds: string[] = [];

  afterAll(async () => {
    for (const userId of cleanupUserIds) {
      await db.creatorProfile.deleteMany({ where: { userId } });
      await db.foundingApplication.deleteMany({ where: { userId } });
      await db.wallet.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
  });

  it("rejects an application missing confirmsFemale with a 400 and the exact error message", async () => {
    const email = `confirms-female-missing-${Date.now()}@example.test`;
    const res = await foundingApply(applyRequest(baseApplication(email, { confirmsFemale: undefined })));
    expect(res.status).toBe(400);
    const body = await res.json();
    const message = JSON.stringify(body.error);
    expect(message).toContain("baddies creator accounts are for female creators only");

    const user = await db.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });

  it("rejects confirmsFemale: false the same way", async () => {
    const email = `confirms-female-false-${Date.now()}@example.test`;
    const res = await foundingApply(applyRequest(baseApplication(email, { confirmsFemale: false })));
    expect(res.status).toBe(400);
  });

  it("accepts a real application with confirmsFemale: true, persisting it on both FoundingApplication and the sibling CreatorProfile", async () => {
    const email = `confirms-female-true-${Date.now()}@example.test`;
    const res = await foundingApply(applyRequest(baseApplication(email)));
    expect(res.status).toBe(201);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    cleanupUserIds.push(user.id);

    const application = await db.foundingApplication.findFirstOrThrow({ where: { email } });
    expect(application.confirmsFemale).toBe(true);

    const creatorProfile = await db.creatorProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(creatorProfile.confirmsFemale).toBe(true);
  });
});
