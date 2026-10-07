"use client";

import Link from "next/link";
import { displayHeadingStyle, pageWrapStyle, primaryButtonStyle } from "@/components/ui";

/**
 * Bad-route 404 — replaces Next.js's bare default page. Reuses the same
 * pageWrapStyle/displayHeadingStyle/primaryButtonStyle language SignInGate
 * (ui.tsx) already uses for a full-page "nothing here yet" state, so a
 * mistyped URL still looks like this app rather than a generic framework
 * error screen.
 *
 * "use client" because ui.tsx is a client module: in a server component
 * its exported style objects are client references, so spreading
 * primaryButtonStyle there silently yields nothing (an unstyled link).
 */
export default function NotFound() {
  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Page not found</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        The page you&apos;re looking for doesn&apos;t exist, or may have moved.
      </p>
      <Link href="/" style={{ ...primaryButtonStyle, display: "block", width: "auto", maxWidth: "220px", margin: "0 auto", textAlign: "center", textDecoration: "none" }}>
        Back to home
      </Link>
    </main>
  );
}
