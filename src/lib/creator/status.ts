import type { CreatorStatus } from "@prisma/client";

/**
 * Creator onboarding state machine, per build brief §6:
 *
 *   Application → Identity Verification → Age Verification → Liveness
 *     → Creator Agreement → Compliance Review → Admin Approval → VERIFIED
 *
 * Mapped onto CreatorProfile.status. This module is the single source of
 * truth for which transitions are legal — routes call `assertTransition`
 * rather than checking status strings inline, so the workflow can't drift
 * out of sync between the application, verification, and admin routes.
 */

const ALLOWED_TRANSITIONS: Record<CreatorStatus, CreatorStatus[]> = {
  PENDING: ["VERIFICATION_REQUIRED", "REJECTED"],
  VERIFICATION_REQUIRED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED", "VERIFICATION_REQUIRED"],
  VERIFIED: ["SUSPENDED", "BANNED"],
  SUSPENDED: ["VERIFIED", "BANNED"],
  REJECTED: ["VERIFICATION_REQUIRED"], // allow re-application
  BANNED: [], // terminal — no route back
};

export class InvalidTransitionError extends Error {
  constructor(from: CreatorStatus, to: CreatorStatus) {
    super(`Invalid creator status transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: CreatorStatus, to: CreatorStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: CreatorStatus, to: CreatorStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Only creators in VERIFIED status may monetise, per build brief §6: "Only approved creators can monetise." */
export function canMonetise(status: CreatorStatus): boolean {
  return status === "VERIFIED";
}
