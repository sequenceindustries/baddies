import type { Metadata } from "next";

// SEO Phase 7: page.tsx here is "use client" and can't export its own
// metadata — a minimal Server Component sibling layout is the standard
// way to attach page-level metadata to a client-component page. This
// registration form has no search intent to satisfy — belt-and-
// suspenders with robots.ts NOT disallowing this path (see that file's
// own comment on why disallow and noindex solve different problems for
// a page that's legitimately reachable pre-account).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
