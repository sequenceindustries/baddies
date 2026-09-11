import type { Metadata } from "next";

// SEO Phase 7 — see src/app/register/layout.tsx for the full reasoning
// (same pattern). An invited Founding Partner's accept-invite flow has
// no search intent to satisfy and nothing worth showing in a search
// result. Reachable pre-account for the same real reason as /register
// (an invited partner has no session yet) — same PUBLIC_PATHS entry in
// src/middleware.ts, same "disallow doesn't apply, noindex does" logic.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PartnerInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
