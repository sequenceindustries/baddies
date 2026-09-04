import { FOUNDING_STATUSES, type FoundingStatus } from "./status";

/**
 * The only automated pipeline transitions in the Founding Baddies flow —
 * everything else (VERIFICATION_REVIEW, VERIFIED, APPROVED, CONTENT_READY,
 * LIVE, REJECTED) stays a manual admin decision via the status dropdown
 * (see src/app/api/admin/founding-applications/[id]/route.ts). These
 * three are pure applicant-driven *completion* signals, not judgment
 * calls, so auto-advancing them is safe: submitting identity+documents
 * really does mean "identity submitted," both contact channels being
 * verified really does mean "contact confirmed," and submitting
 * banking+all agreements really does mean "onboarding complete" — none
 * of these are a review decision being made on the platform's behalf.
 *
 * Forward-only: never regresses an application that's already further
 * along (e.g. an admin who jumped straight to VERIFIED shouldn't get
 * knocked back to CONTACT_CONFIRMED just because a WhatsApp confirm
 * happens to land afterwards), and never advances past what was reached
 * on a previous call.
 */
const STAGE_INDEX: Record<FoundingStatus, number> = Object.fromEntries(
  FOUNDING_STATUSES.map((s, i) => [s, i])
) as Record<FoundingStatus, number>;

export function advanceFoundingStatus(
  current: FoundingStatus,
  reached: "CONTACT_CONFIRMED" | "IDENTITY_SUBMITTED" | "ONBOARDING"
): FoundingStatus {
  // REJECTED sits outside the linear stage order — never move a
  // rejected application back into the active pipeline.
  if (current === "REJECTED") return current;
  if (STAGE_INDEX[reached] > STAGE_INDEX[current]) return reached;
  return current;
}
