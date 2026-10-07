import type { Metadata } from "next";

// The page is a client component, so its title lives in this sibling
// layout — without it the tab and Google Analytics reports show the bare
// site-wide "baddies" title for this page.
export const metadata: Metadata = { title: "Settings | baddies" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
