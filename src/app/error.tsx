"use client";

import { displayHeadingStyle, pageWrapStyle, primaryButtonStyle } from "@/components/ui";

/**
 * App-level error boundary — replaces Next.js's bare default error
 * screen for an unhandled render/render-time error. Must be a client
 * component (Next.js's own requirement for error.tsx) and receives the
 * thrown error plus a reset() that re-renders the segment that failed.
 * Styled to match not-found.tsx / SignInGate (ui.tsx).
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Something went wrong</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        An unexpected error occurred. You can try again, or head back to home.
      </p>
      <button onClick={reset} style={{ ...primaryButtonStyle, marginBottom: "0.75rem" }}>
        Try again
      </button>
      <a href="/" style={{ display: "block", textAlign: "center", fontSize: "0.88rem", color: "var(--text-muted)" }}>
        Back to home
      </a>
    </main>
  );
}
