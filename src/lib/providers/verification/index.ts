import type { VerificationProvider } from "./types";
import { StubVerificationProvider } from "./stub";

export * from "./types";

/**
 * Single place that resolves which VerificationProvider implementation is
 * active. Swapping vendors (or A/B testing two) means adding a case here,
 * not hunting through the app for hard-coded provider calls.
 *
 * Real vendor implementations (e.g. Persona, Veriff, Yoti) should live in
 * sibling files (e.g. `./persona.ts`) implementing `VerificationProvider`,
 * added here once a provider is selected post-underwriting (see build
 * brief §5, §36 — do not wire a real provider before approval).
 */
/**
 * The stub provider auto-PASSES every identity/age/liveness check. That's
 * fine for local dev, but in production it would let an applicant mark
 * their own ID checks as passed — so it's refused there unless
 * ALLOW_STUB_VERIFICATION=true is set deliberately (private staging).
 * Real creator evidence in production goes through
 * /api/creator/verification/capture → MANUAL_REVIEW → admin review.
 */
export function stubVerificationBlocked(): boolean {
  return (
    (process.env.VERIFICATION_PROVIDER ?? "stub") === "stub" &&
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_STUB_VERIFICATION !== "true"
  );
}

export function getVerificationProvider(): VerificationProvider {
  const providerName = process.env.VERIFICATION_PROVIDER ?? "stub";

  switch (providerName) {
    case "stub":
      return new StubVerificationProvider();
    default:
      throw new Error(
        `Unknown VERIFICATION_PROVIDER "${providerName}". Register an implementation in src/lib/providers/verification/index.ts.`
      );
  }
}
