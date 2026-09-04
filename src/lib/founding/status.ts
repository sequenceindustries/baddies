/**
 * Single source of truth for the FoundingApplicationStatus value list —
 * previously duplicated across four call sites (the Prisma enum, this
 * route's zod schema, the admin page's dropdown, and the command-centre
 * funnel's stage order), found while reworking the pipeline to match the
 * MASTER REQUIREMENTS spec's exact stage names (§6). Keep this array in
 * sync with the `FoundingApplicationStatus` enum in prisma/schema.prisma
 * — Prisma doesn't let us generate a runtime array from a schema enum
 * automatically, so this is the one place both are hand-kept in step.
 */
export const FOUNDING_STATUSES = [
  "APPLIED",
  "CONTACT_CONFIRMED",
  "IDENTITY_SUBMITTED",
  "VERIFICATION_REVIEW",
  "VERIFIED",
  "APPROVED",
  "ONBOARDING",
  "CONTENT_READY",
  "LIVE",
  "REJECTED",
] as const;

export type FoundingStatus = (typeof FOUNDING_STATUSES)[number];
