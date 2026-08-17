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
