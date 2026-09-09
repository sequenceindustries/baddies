import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { assertFoundingPartnerCapNotReached, FoundingPartnerCapReachedError } from "@/lib/founding/partner-cap";
import { setPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

/**
 * Integration test (real Postgres) for the 50-Founding-Partner cap rule
 * used inside POST /api/partner-invite/accept's Serializable
 * transaction — exercised here directly against the lib function
 * rather than the HTTP route, matching this suite's own established
 * pattern of testing the underlying logic function.
 *
 * This dev database is shared with every other integration test file
 * (vitest runs files in parallel), and several of them create/delete
 * real FoundingPartner rows concurrently with this file's own run — so
 * every assertion below is written to be correct regardless of the
 * live global ACTIVE count at any given instant, never by snapshotting
 * and comparing against it.
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

describe.skipIf(!dbAvailable)("assertFoundingPartnerCapNotReached (integration)", () => {
  afterAll(async () => {
    // Restore the real default in case a test below changed it.
    await setPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT, "50");
  });

  it("allows acceptance and returns a positive position number when well under the limit", async () => {
    await setPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT, "50");

    const position = await db.$transaction((tx) => assertFoundingPartnerCapNotReached(tx, false));
    expect(position).toBeGreaterThan(0);
    expect(Number.isInteger(position)).toBe(true);
  });

  it("rejects acceptance once ACTIVE partners reach the configured limit", async () => {
    // A limit of 0 rejects deterministically regardless of the real
    // ACTIVE count (which is always >= 0) — deliberately avoids
    // depending on any observed count at all, since the live count can
    // shift between any two reads under this suite's cross-file
    // parallelism.
    await setPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT, "0");

    await expect(db.$transaction((tx) => assertFoundingPartnerCapNotReached(tx, false))).rejects.toThrow(
      FoundingPartnerCapReachedError
    );

    await setPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT, "50");
  });

  it("capOverride bypasses the limit entirely, even at (or over) capacity", async () => {
    // Same deterministic "at cap" limit as the rejection test above —
    // capOverride must skip the check (and the count read) entirely,
    // so this never even depends on the real ACTIVE count either.
    await setPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT, "0");

    const position = await db.$transaction((tx) => assertFoundingPartnerCapNotReached(tx, true));
    expect(position).toBeGreaterThan(0);

    await setPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT, "50");
  });
});
