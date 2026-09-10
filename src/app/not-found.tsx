import Link from "next/link";
import { displayHeadingStyle, pageWrapStyle, primaryButtonStyle } from "@/components/ui";

/**
 * Bad-route 404 — replaces Next.js's bare default page. Reuses the same
 * pageWrapStyle/displayHeadingStyle/primaryButtonStyle language SignInGate
 * (ui.tsx) already uses for a full-page "nothing here yet" state, so a
 * mistyped URL still looks like this app rather than a generic framework
 * error screen.
 */
export default function NotFound() {
  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Page not found</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        The page you&apos;re looking for doesn&apos;t exist, or may have moved.
      </p>
      <Link href="/" style={{ ...primaryButtonStyle, display: "block", textAlign: "center", textDecoration: "none" }}>
        Back to home
      </Link>
    </main>
  );
}
