import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Nav, SessionProvider } from "@/components/ui";
import { AgeGate } from "@/components/age-gate";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { isKnownCrawlerUserAgent } from "@/lib/seo/crawler";

// Performance audit, P0: this was a `@import url("https://fonts.
// googleapis.com/...")` inside globals.css — one of the classic render-
// blocking font patterns. The browser had to fetch the HTML, then the
// stylesheet, discover the @import inside it, fetch Google's CSS from a
// third-party origin (no preconnect hint existed either, so DNS/TLS for
// that origin didn't even start early), THEN fetch the actual font
// files from a fourth request — a fully serial chain on every single
// page load, for every visitor, before body text could render in its
// real font. next/font/google self-hosts the exact same Montserrat
// files at build time (served from this app's own origin, alongside
// every other static asset) and inlines the @font-face rules directly
// into the page — zero external requests, zero extra DNS/TLS handshake,
// and it still sets font-display: swap itself so text is never invisible
// while the font loads. All 5 weights × both styles are declared, but
// (per how @font-face lazy-loading actually works) a browser only ever
// fetches the specific weight+style FILE combinations real text on the
// page ends up using — the same 6 combinations the old @import URL
// named explicitly (400/500/600/700/800 normal, 600 italic) — so this
// isn't a payload increase, just the same bytes served locally instead
// of round-tripped through a third party.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "baddies",
  description: "Verified. Safe. Africa's adult content network. 18+ only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read server-side and passed down as a plain prop rather than checked
  // inside Nav itself — Nav is a client component, and a non-NEXT_PUBLIC_
  // env var like LAUNCH_MODE resolves correctly during SSR but comes back
  // undefined once the same code re-runs in the browser on hydration,
  // which would flip the rendered links right after paint.
  const comingSoon = process.env.LAUNCH_MODE === "coming_soon";
  // SEO: lets a known search-engine crawler (Googlebot etc.) straight
  // past the 18+ AgeGate below, which otherwise blocks 100% of
  // server-rendered content on every page for every visitor — see
  // AgeGate's own doc comment and src/lib/seo/crawler.ts. Read here
  // (a Server Component) rather than in AgeGate itself, since
  // request headers aren't available inside a client component.
  const isCrawler = isKnownCrawlerUserAgent(headers().get("user-agent"));
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
        <AgeGate isCrawler={isCrawler}>
          {/* Performance audit: one shared session fetch for the whole
              tree instead of every useSession() caller (Nav, every
              page, AccountMenu, etc.) firing its own — see
              SessionProvider's own comment in components/ui.tsx. */}
          <SessionProvider>
            <Nav comingSoon={comingSoon} />
            {children}
            <BottomTabBar />
          </SessionProvider>
        </AgeGate>
      </body>
    </html>
  );
}
