/**
 * Pure — no DB access — same reasoning as isTrialActive
 * (src/lib/entitlements/trial.ts): unit-testable without mocking
 * Prisma. No cron/job-queue system exists in this codebase, so nothing
 * ever flips a story to "expired" on a schedule — every real read
 * (GET /api/stories, GET /api/stories/:creatorProfileId) must compare
 * expiresAt to now() itself, either via this helper or an equivalent
 * `expiresAt: { gt: new Date() }` Prisma filter.
 */
export function isStoryActive(story: { expiresAt: Date | string } | null): boolean {
  if (!story) return false;
  return new Date(story.expiresAt).getTime() > Date.now();
}
