import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Nav, SessionProvider } from "@/components/ui";
import { AgeGate } from "@/components/age-gate";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { RouteTransition } from "@/components/route-transition";
import { StructuredData } from "@/components/structured-data";
import { isKnownCrawlerUserAgent } from "@/lib/seo/crawler";
import { SITE_URL } from "@/lib/seo/site-url";
import Script from "next/script";
import { AnalyticsEvents } from "@/components/analytics-events";

// Type system (dayos-inspired redesign): a condensed bold grotesque for
// big all-caps display headings + a clean neo-grotesque for everything
// else. Suisse Intl (the reference) is commercial, so these are the
// closest free equivalents. Self-hosted via next/font (no render-blocking
// third-party CSS, font-display: swap); a browser only downloads the
// weight files real text actually uses.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "baddies",
  description: "Verified. Safe. Africa's adult content network. 18+ only.",
  // Every page inherits these unless it exports its own generateMetadata
  // with its own openGraph/twitter block (Next.js merges shallowly, so
  // a page-level override replaces this default rather than needing to
  // repeat it). hero-banner.jpg (2400x1371, ~1.75:1) is the only stable,
  // non-expiring image asset available site-wide — see this project's
  // SEO plan for why avatar/cover URLs (7-day signed, re-signed per
  // read) can't back a fallback OG image.
  openGraph: {
    type: "website",
    siteName: "baddies",
    images: ["/hero-banner.jpg"],
  },
  twitter: {
    card: "summary_large_image",
  },
  // The real, honest, industry-standard adult-content label recognized
  // by SafeSearch and parental-control content filters — not a
  // manipulative indexing trick. baddies is 18+ only (see AgeGate); this
  // just makes that machine-readable the same way real adult platforms
  // already do.
  other: {
    rating: "RTA-5042-1996-1400-1577-RTA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // SEO: lets a known search-engine crawler (Googlebot etc.) straight
  // past the 18+ AgeGate below, which otherwise blocks 100% of
  // server-rendered content on every page for every visitor — see
  // AgeGate's own doc comment and src/lib/seo/crawler.ts. Read here
  // (a Server Component) rather than in AgeGate itself, since
  // request headers aren't available inside a client component.
  const isCrawler = isKnownCrawlerUserAgent(headers().get("user-agent"));
  return (
    <html lang="en" className={`${inter.variable} ${barlowCondensed.variable}`}>
      <body>
        {/* Production only — dev servers would otherwise send local
            test traffic into the real GA4 property. */}
        {process.env.NODE_ENV === "production" && (
          <>
            <Script src="https://www.googletagmanager.com/gtag/js?id=G-TZ7LP4HMWG" strategy="afterInteractive" />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'G-TZ7LP4HMWG');
              `}
            </Script>
          </>
        )}
        <StructuredData />
        <AnalyticsEvents />
        <AgeGate isCrawler={isCrawler}>
          {/* Performance audit: one shared session fetch for the whole
              tree instead of every useSession() caller (Nav, every
              page, AccountMenu, etc.) firing its own — see
              SessionProvider's own comment in components/ui.tsx. */}
          <SessionProvider>
            <Nav />
            <RouteTransition>{children}</RouteTransition>
            <BottomTabBar />
          </SessionProvider>
        </AgeGate>
      </body>
    </html>
  );
}
