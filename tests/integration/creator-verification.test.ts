import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { applyVerificationOutcome } from "@/lib/creator/verification-workflow";
import { assertTransition } from "@/lib/creator/status";

/**
 * Integration test for the creator verification workflow end-to-end:
 * application → three passed verification sessions → auto-advance to
 * UNDER_REVIEW → admin approval → VERIFIED.
 *
 * Requires a real Postgres connection (DATABASE_URL) — this is exactly
 * the kind of test the build brief's §33 "Integration tests: Verification"
 * calls for. It's skipped automatically if no DB is reachable, e.g. in a
 * sandbox with restricted network access; it runs in CI where Postgres is
 * provisioned as a service container (see .github/workflows/ci.yml).
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

describe.skipIf(!dbAvailable)("creator verification workflow (integration)", () => {
  it("advances a creator from application through to VERIFIED", async () => {
    const user = await db.user.create({
      data: {
        email: `creator-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        role: "CREATOR",
        profile: { create: { displayName: "Test Creator" } },
        wallet: { create: {} },
      },
    });

    const creatorProfile = await db.creatorProfile.create({
      data: { userId: user.id, status: "VERIFICATION_REQUIRED" },
    });

    for (const type of ["IDENTITY", "AGE", "LIVENESS"] as const) {
      const session = await db.verificationSession.create({
        data: {
          type,
          status: "PENDING",
          creatorProfileId: creatorProfile.id,
          provider: "stub",
          providerSessionId: `test_${type}_${creatorProfile.id}`,
        },
      });
      await applyVerificationOutcome({
        providerSessionId: session.providerSessionId!,
        status: "PASSED",
        providerReference: `ref_${session.id}`,
      });
    }

    const afterChecks = await db.creatorProfile.findUniqueOrThrow({
      where: { id: creatorProfile.id },
    });
    expect(afterChecks.status).toBe("UNDER_REVIEW");

    assertTransition(afterChecks.status, "VERIFIED");
    const approved = await db.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: { status: "VERIFIED", approvedAt: new Date() },
    });
    expect(approved.status).toBe("VERIFIED");

    // cleanup
    await db.creatorProfile.delete({ where: { id: creatorProfile.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
