import type { Metadata } from "next";

// SEO Phase 7 — see src/app/register/layout.tsx for the full reasoning
// (same pattern: page.tsx here is "use client" and needs a minimal
// Server Component sibling to carry page-level metadata). An email-
// verification link-landing page has no search intent to satisfy.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
