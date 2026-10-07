import type { Metadata } from "next";

// The page is a client component, so its title lives in this sibling
// layout — without it the tab and Google Analytics reports show the bare
// site-wide "baddies" title for this page.
export const metadata: Metadata = { title: "Wallet | baddies" };

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children;
}
