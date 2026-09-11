-- Female-only creator eligibility declaration ("baddies creators are
-- female only, no men allowed"). Self-declared by the applicant at
-- apply-time (POST /api/creator/apply, POST /api/founding/apply) and
-- enforced by human admin review during the existing verification-
-- approval step, cross-checked against the identity/age/liveness
-- evidence already collected -- no automated/biometric check, matching
-- this codebase's own consistent verification philosophy everywhere
-- else. Purely additive, NOT NULL DEFAULT false so every existing row
-- (the seeded dummy creators, any already-verified real creators, any
-- historical founding applications) needs no backfill and is not
-- retroactively required to re-verify.
ALTER TABLE "creator_profiles" ADD COLUMN "confirmsFemale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "founding_applications" ADD COLUMN "confirmsFemale" BOOLEAN NOT NULL DEFAULT false;
