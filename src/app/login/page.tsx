import type { Metadata } from "next";
import { LoginForm } from "./login-form";

// SEO Phase 7: a sign-in form has no search intent to satisfy and
// nothing worth showing in a search result — belt-and-suspenders with
// robots.ts NOT disallowing this path (see that file's own comment on
// why disallow and noindex solve different problems for a page that's
// legitimately reachable pre-account).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server component so LAUNCH_MODE (not a NEXT_PUBLIC_ var) resolves once
// on the server and reaches the client form as a plain prop — reading
// process.env directly inside a "use client" file works for the initial
// SSR pass but comes back undefined on the browser's own re-run during
// hydration, flipping the rendered link right after paint.
export default function LoginPage() {
  const comingSoon = process.env.LAUNCH_MODE === "coming_soon";
  return <LoginForm comingSoon={comingSoon} />;
}
