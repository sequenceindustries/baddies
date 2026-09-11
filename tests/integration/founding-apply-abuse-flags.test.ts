import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { POST as foundingApply } from "@/app/api/founding/apply/route";

/**
 * Integration test (real Postgres) for POST /api/founding/apply's
 * DUPLICATE_APPLICATION_ATTEMPT flagging — a repeat submission against
 * an email that already has an account is still fully blocked (409,
 * unchanged behavior) but now also flagged for admin visibility, same
 * as self-referral (see tests/integration/referral-attribution.test.ts).
 * Calls the route's exported POST handler directly, same approach as
 * tests/integration/payment-webhook-commission.test.ts.
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

describe.skipIf(!dbAvailable)("POST /api/founding/apply duplicate-email abuse flag (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupAbuseFlagIds: string[] = [];

  afterAll(async () => {
    await db.abuseFlag.deleteMany({ where: { id: { in: cleanupAbuseFlagIds } } });
    for (const userId of cleanupUserIds) {
      await db.wallet.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
  });

  it("blocks a duplicate-email application with 409 and writes a DUPLICATE_APPLICATION_ATTEMPT flag", async () => {
    const email = `dup-apply-${Date.now()}@example.test`;
    const existingUser = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "CREATOR", profile: { create: { displayName: "Existing" } }, wallet: { create: {} } },
    });
    cleanupUserIds.push(existingUser.id);

    const flagsBefore = await db.abuseFlag.count({ where: { type: "DUPLICATE_APPLICATION_ATTEMPT" } });

    const res = await foundingApply(
      applyRequest({
        fullName: "Repeat Applicant",
        stageName: "RepeatStage",
        email,
        password: "a-real-password-123",
        phone: "0820000001",
        country: "South Africa",
        city: "Cape Town",
        platforms: [{ category: "social", platform: "Instagram", handle: "@repeat", link: "" }],
        confirmsAdult: true,
        confirmsFemale: true,
        agreesToVerification: true,
      })
    );

    expect(res.status).toBe(409);

    const flags = await db.abuseFlag.findMany({
      where: { type: "DUPLICATE_APPLICATION_ATTEMPT", reason: { contains: email } },
    });
    expect(flags.length).toBe(1);
    expect(flags[0]!.autoDetected).toBe(true);
    cleanupAbuseFlagIds.push(...flags.map((f) => f.id));

    const flagsAfter = await db.abuseFlag.count({ where: { type: "DUPLICATE_APPLICATION_ATTEMPT" } });
    expect(flagsAfter).toBe(flagsBefore + 1);

    // No new FoundingApplication row should have been created for this
    // blocked attempt — the block is still real, only the flag is new.
    const apps = await db.foundingApplication.findMany({ where: { email } });
    expect(apps.length).toBe(0);
  });
});
