import { nanoid } from "nanoid";
import type {
  CreateVerificationSessionInput,
  VerificationOutcome,
  VerificationProvider,
  VerificationSessionHandle,
} from "./types";

/**
 * Deterministic stub provider for local development and automated tests.
 * NEVER wire this into a production environment — it does not perform any
 * real verification. `VERIFICATION_PROVIDER=stub` should fail a production
 * readiness check (see docs/architecture.md, Sprint 1 gating).
 */
export class StubVerificationProvider implements VerificationProvider {
  readonly name = "stub";

  async createVerificationSession(
    input: CreateVerificationSessionInput
  ): Promise<VerificationSessionHandle> {
    return {
      providerSessionId: `stub_${input.verificationType.toLowerCase()}_${nanoid(10)}`,
      hostedUrl: undefined,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async verifyIdentity(providerSessionId: string): Promise<VerificationOutcome> {
    return this.pass(providerSessionId);
  }

  async verifyAge(providerSessionId: string): Promise<VerificationOutcome> {
    return this.pass(providerSessionId);
  }

  async verifyLiveness(providerSessionId: string): Promise<VerificationOutcome> {
    return this.pass(providerSessionId);
  }

  async verifyParticipant(providerSessionId: string): Promise<VerificationOutcome> {
    return this.pass(providerSessionId);
  }

  async getVerificationStatus(providerSessionId: string): Promise<VerificationOutcome> {
    return this.pass(providerSessionId);
  }

  private pass(providerSessionId: string): VerificationOutcome {
    return {
      providerSessionId,
      status: "PASSED",
      providerReference: `stub-ref-${providerSessionId}`,
      completedAt: new Date(),
    };
  }
}
