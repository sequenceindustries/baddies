import { db } from "@/lib/db/client";

/**
 * Pure — no DB access — so it's unit-testable without mocking Prisma,
 * same reasoning as pctChange/ratePercent in src/lib/analytics/rates.ts.
 * The stored `status` column is authoritative for admin display (see
 * GET /api/admin/members/[userId], which lazily corrects a stale row),
 * but every real access decision calls this directly against
 * `expiresAt` too — an unattended trial must never over-grant access
 * just because nothing has flipped its status to EXPIRED yet (no cron/
 * job-queue system exists in this codebase to do that flip reliably).
 */
export function isTrialActive(trial: { status: string; expiresAt: Date | string } | null): boolean {
  if (!trial) return false;
  if (trial.status !== "ACTIVE") return false;
  return new Date(trial.expiresAt).getTime() > Date.now();
}

/**
 * Called from both checkout routes (vip-pass, subscribe) right after a
 * paid subscription is successfully created — either purchase is a
 * genuine acquisition win the spec explicitly wants tracked ("Trial
 * converted"). A no-op (not an error) if the fan never had a trial, or
 * it wasn't ACTIVE — conversion only makes sense from an active trial.
 */
export async function markTrialConvertedIfActive(fanId: string): Promise<void> {
  await db.fanTrial.updateMany({
    where: { fanId, status: "ACTIVE" },
    data: { status: "CONVERTED", convertedAt: new Date() },
  });
}
