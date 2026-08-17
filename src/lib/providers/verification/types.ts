/**
 * VerificationProvider — abstraction over identity/age/liveness verification
 * vendors. Per build brief §5: "The exact verification provider must be
 * configurable. Do not hard-code the application around one provider."
 *
 * Provider credentials must never be exposed client-side — implementations
 * of this interface live in server-only modules and are invoked from API
 * routes / server actions, never imported into client components.
 */

export type VerificationSubjectType = "creator" | "participant";

export interface CreateVerificationSessionInput {
  subjectType: VerificationSubjectType;
  subjectId: string; // CreatorProfile.id or VerificationParticipant.id
  verificationType: "IDENTITY" | "AGE" | "LIVENESS" | "PARTICIPANT";
  redirectUrl?: string; // where to send the user after a hosted flow
}

export interface VerificationSessionHandle {
  providerSessionId: string;
  /** Hosted URL to redirect the user to, if the provider uses a hosted flow. */
  hostedUrl?: string;
  expiresAt?: Date;
}

export type VerificationOutcomeStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "PASSED"
  | "FAILED"
  | "EXPIRED"
  | "MANUAL_REVIEW";

export interface VerificationOutcome {
  providerSessionId: string;
  status: VerificationOutcomeStatus;
  /** Pointer into the provider's own hosted record, never a raw document blob. */
  providerReference?: string;
  failureReason?: string;
  completedAt?: Date;
}

export interface VerificationProvider {
  readonly name: string;

  createVerificationSession(
    input: CreateVerificationSessionInput
  ): Promise<VerificationSessionHandle>;

  /** Confirms government ID / document authenticity for the subject. */
  verifyIdentity(providerSessionId: string): Promise<VerificationOutcome>;

  /** Confirms the subject meets the platform's minimum age requirement. */
  verifyAge(providerSessionId: string): Promise<VerificationOutcome>;

  /** Confirms a live human matches the submitted identity documents. */
  verifyLiveness(providerSessionId: string): Promise<VerificationOutcome>;

  /** Verifies a third-party content participant (collaborator), distinct from the uploading creator. */
  verifyParticipant(providerSessionId: string): Promise<VerificationOutcome>;

  /** Polls current status — used by webhook-less providers or as a reconciliation fallback. */
  getVerificationStatus(providerSessionId: string): Promise<VerificationOutcome>;
}
