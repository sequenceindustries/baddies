import type { Prisma } from "@prisma/client";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

/**
 * Thrown when the 50-Founding-Partner cap (FOUNDING_PARTNERS_LIMIT) is
 * reached and the invitation being accepted has no admin capOverride.
 * A PENDING invitation created while at cap is never blocked from
 * existing (it's the waitlist, structurally) — only accepting one is.
 */
export class FoundingPartnerCapReachedError extends Error {
  constructor(public readonly limit: number) {
    super(`All ${limit} Founding Partner positions are filled.`);
  }
}

/**
 * Enforces the 50-Founding-Partner cap inside the acceptance
 * transaction (see POST /api/partner-invite/accept) — pulled out into
 * its own small, directly-testable function rather than living inline
 * in the route, so the cap rule itself (not the whole HTTP request/
 * response plumbing around it) can be exercised against real Postgres.
 *
 * Must be called with a Serializable transaction client so a genuine
 * race between two concurrent accept requests exactly at the cap can't
 * both read "49 active" and both succeed — Postgres itself rejects one
 * as a serialization failure rather than this count ever being trusted
 * stale under concurrency.
 *
 * Returns the position number (1-indexed, among ALL acceptances ever —
 * not just currently-active ones) this newly-accepted partner should
 * be stamped with, so a caller who doesn't need the cap check itself
 * disabled (capOverride) still gets a meaningful "Founding Partner #N".
 */
export async function assertFoundingPartnerCapNotReached(
  tx: Prisma.TransactionClient,
  capOverride: boolean
): Promise<number> {
  if (!capOverride) {
    const rawLimit = Number(await getPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_PARTNERS_LIMIT));
    // `|| 50` would silently treat a legitimately-configured "0" (pause
    // all new acceptances) as "unset" and fall back to 50 — 0 is
    // falsy but a perfectly valid limit, so check finiteness instead.
    const limit = Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 50;
    const activeCount = await tx.foundingPartner.count({ where: { status: "ACTIVE" } });
    if (activeCount >= limit) {
      throw new FoundingPartnerCapReachedError(limit);
    }
  }
  return (await tx.foundingPartner.count()) + 1;
}
