"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, roleHomePath } from "@/components/ui";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { HowItWorks } from "@/components/how-it-works";
import { Countdown } from "@/components/countdown";

interface DiscoveryResponse {
  creators: CreatorCardData[];
}

// Fixed launch target, not "35 days from whenever someone loads this
// page" — see Countdown's own comment on why that has to be a real date,
// not a rolling duration. 35 days out from the day this went in.
const LAUNCH_DATE = new Date("2026-10-08T00:00:00Z");

/**
 * The real landing page (Sprint 0's placeholder replaced) — an anonymous
 * visitor's actual entry point. Logged-in visitors skip straight to their
 * role's home (roleHomePath — the feed, /feed, for everyone except
 * PARTNER, which keeps its own dashboard as the default; see
 * roleHomePath's own comment). Per product decision, the only CTA on
 * this page (and in Nav when it's showing) is the Founding Baddies
 * "Apply now" banner — no separate Join/Sign in buttons here.
 */
export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [topCreators, setTopCreators] = useState<CreatorCardData[]>([]);

  useEffect(() => {
    if (!loading && user) {
      router.replace(roleHomePath(user.role));
    }
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/top-creators")
      .then((r) =>
        r.ok && r.headers.get("content-type")?.includes("application/json")
          ? r.json()
          : { creators: [] },
      )
      .then((body: DiscoveryResponse) => {
        if (!cancelled) setTopCreators(body.creators ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only hide once we KNOW there's a logged-in user to redirect — not
  // while that's still loading, which would otherwise blank the page
  // (this is every visitor's first paint) for a beat on every load.
  if (user) return null;

  return (
    <main>
      <section className="hero-plain">
        <div className="hero-plain-content">
          <h1 style={heroTitleStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/baddies-wordmark-white.webp" alt="baddies" style={heroLogoStyle} />
          </h1>
          <p style={heroSubStyle}>
            Africa&apos;s adult content network — where verified South African creators publish
            exclusive content and get paid directly by the fans who support them. Browse free
            previews with no card required, or subscribe to unlock more.
          </p>
          <Countdown target={LAUNCH_DATE} label="Launching in" />
        </div>
      </section>

      {/* Larger cards, one sliding row (CreatorCardRow's size="lg"
          scroll) rather than several stacked rows — this is the one
          creator row a signed-out visitor sees before joining, so it
          gets more visual weight than the same row does elsewhere
          (Discover, fan Home). */}
      {topCreators.length > 0 && (
        <section style={sectionStyle}>
          <CreatorCardRow title="The Baddest" creators={topCreators} size="lg" scroll />
        </section>
      )}

      <HowItWorks />

      {/* Moved to the bottom of the page per product decision — this
          used to sit right under the hero (pulled up over its bottom
          edge); now it's the last thing before the footer, after the
          visitor has already seen the creator row and both "how it
          works" explainers. */}
      <section style={foundingBannerSectionStyle}>
        <Link href="/founding-baddies" style={foundingBannerStyle} className="hover-lift">
          <span style={foundingBannerKickerStyle}>First generation</span>
          <span style={foundingBannerTitleStyle}>Become a Founding baddie</span>
          <p style={foundingBannerBodyStyle}>
            Be part of baddies from the beginning. Join the first generation of creators helping
            shape Africa&apos;s new adult content network.
          </p>
          <span style={foundingBannerArrowStyle}>Join baddies →</span>
        </Link>
      </section>

      <footer style={footerStyle}>
        <p style={footerTaglineStyle}>South Africa to the World!</p>
        <nav style={footerLinksRowStyle}>
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} style={footerLinkStyle}>
              {link.label}
            </Link>
          ))}
        </nav>
        <a
          href="https://www.instagram.com/baddest.africa/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="baddies on Instagram"
          style={footerSocialLinkStyle}
        >
          <InstagramIcon />
        </a>
        <p style={footerCopyrightStyle}>© {new Date().getFullYear()} baddies. All rights reserved.</p>
      </footer>
    </main>
  );
}

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/creator-terms", label: "Creator Terms" },
  { href: "/content-policy", label: "Content Policy" },
  { href: "/age-policy", label: "18+ / Age Policy" },
  { href: "/dmca", label: "DMCA / Copyright" },
  { href: "/contact", label: "Contact" },
];

// Wraps the logo image rather than styling text directly now — h1 stays
// for the page's heading semantics/accessible name (the img's alt covers
// that), margin/line-height carried over from the old text treatment so
// the layout rhythm below it (subhead, countdown) doesn't shift.
const heroTitleStyle: React.CSSProperties = {
  margin: "0 0 0.6rem",
  lineHeight: 1,
};

const heroLogoStyle: React.CSSProperties = {
  width: "clamp(220px, 24vw, 420px)",
  height: "auto",
};

const heroSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "1.05rem",
  lineHeight: 1.6,
  maxWidth: "560px",
  margin: "0 auto",
};

const sectionStyle: React.CSSProperties = {
  padding: "1.5rem 1.75rem",
  maxWidth: "1100px",
  margin: "0 auto 1.5rem",
};

// Now the last section before the footer (moved down from just under
// the hero) — a plain stacked section like the others, so the old
// negative-margin/position/zIndex "pulled up over the hero" treatment
// no longer applies.
const foundingBannerSectionStyle: React.CSSProperties = {
  padding: "0 1.75rem",
  maxWidth: "1100px",
  margin: "0 auto 2rem",
};

// Border removed per product decision — background + boxShadow glow
// still read as a distinct block without a hard edge.
const foundingBannerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.85rem",
  textDecoration: "none",
  color: "var(--text)",
  background: "var(--surface)",
  borderRadius: "20px",
  padding: "3rem 2rem",
  boxShadow: "var(--glow)",
  textAlign: "center",
};

const foundingBannerKickerStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--accent)",
  background: "var(--surface-raised)",
  borderRadius: "999px",
  padding: "0.25rem 0.75rem",
};

const foundingBannerTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.6rem",
  fontWeight: 600,
};

const foundingBannerBodyStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.6,
  maxWidth: "420px",
  margin: 0,
};

const foundingBannerArrowStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 700,
  fontSize: "1rem",
};

const footerStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "0 1.75rem 2.5rem",
};

const footerTaglineStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.85rem",
  fontWeight: 600,
  margin: "0 0 1rem",
};

const footerLinksRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.4rem 1.1rem",
  marginBottom: "1rem",
};

const footerLinkStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.78rem",
  textDecoration: "none",
};

// A small, muted icon rather than a prominent button — matches the
// legal-link row's own understated weight, just one more quiet way to
// find the page.
const footerSocialLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  color: "var(--text-muted)",
  marginBottom: "1rem",
};

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
    </svg>
  );
}

const footerCopyrightStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.75rem",
  opacity: 0.75,
  margin: 0,
};
