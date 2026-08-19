import type { ContentStatus } from "@prisma/client";

/**
 * Content lifecycle state machine.
 *
 * Product decision: uploads do not sit in an admin moderation queue —
 * DRAFT → UPLOADED → PROCESSING → APPROVED is the whole happy path now,
 * with no PENDING_REVIEW gate in between (see the upload route's own
 * comment on this, src/app/api/creator/content/route.ts). PENDING_REVIEW
 * stays a legal state — reachable from APPROVED — for the case a report
 * pulls something back for a human to re-review, just not as a mandatory
 * stop every upload has to clear first.
 *
 * Mirrors src/lib/creator/status.ts — same rationale: encode legal
 * transitions in one place so upload/moderation/admin routes can't drift
 * out of sync.
 */

const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["UPLOADED"],
  UPLOADED: ["PROCESSING", "REMOVED"],
  PROCESSING: ["APPROVED", "REJECTED"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"], // reachable only via a report-triggered re-review, not the upload path
  APPROVED: ["PENDING_REVIEW", "REMOVED"], // re-review on report, or takedown
  REJECTED: ["PENDING_REVIEW"], // creator can resubmit after fixing an issue
  REMOVED: [], // terminal
};

export class InvalidContentTransitionError extends Error {
  constructor(from: ContentStatus, to: ContentStatus) {
    super(`Invalid content status transition: ${from} → ${to}`);
    this.name = "InvalidContentTransitionError";
  }
}

export function canTransitionContent(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertContentTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransitionContent(from, to)) {
    throw new InvalidContentTransitionError(from, to);
  }
}

/**
 * Content is visible to fans (subject to entitlement) only once it has
 * cleared human moderation review AND been explicitly published by the
 * creator. Processing/uploading alone never makes content live — see
 * build brief §10: "Do not attempt to make automated moderation the sole
 * decision-maker."
 */
export function isPubliclyVisible(status: ContentStatus): boolean {
  return status === "APPROVED";
}
