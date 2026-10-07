import type { Metadata } from "next";

// The page is a client component, so its title lives in this sibling
// layout — without it the tab and Google Analytics reports show the bare
// site-wide "baddies" title for this page.
export const metadata: Metadata = { title: "My profile | baddies" };

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
