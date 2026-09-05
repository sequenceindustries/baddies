"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, roleHomePath } from "@/components/ui";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { HowItWorks, HowItWorksForCreators } from "@/components/how-it-works";
import { Countdown } from "@/components/countdown";
import { HeroBanner } from "@/components/hero-visual";

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
 * role's home (roleHomePath — a creator lands on their Dashboard, not a
 * fan-oriented feed). Per product decision, the only CTA on this page (and
 * in Nav when it's showing) is the Founding Baddies "Apply now" banner —
 * no separate Join/Sign in buttons here.
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
      <HeroBanner>
        <h1 style={heroTitleStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baddies-wordmark-white.webp" alt="baddies" style={heroLogoStyle} />
        </h1>
        <p style={heroSubStyle}>
          A premium platform where verified South African creators publish exclusive content and
          get paid directly by the fans who support them. Browse free previews with no card
          required, or subscribe to unlock more.
        </p>
        <Countdown target={LAUNCH_DATE} label="Launching in" />
      </HeroBanner>

      <section style={foundingBannerSectionStyle}>
        <Link href="/founding-baddies" style={foundingBannerStyle} className="hover-lift">
          <span style={foundingBannerKickerStyle}>Now recruiting</span>
          <span style={foundingBannerTitleStyle}>Become a Founding baddie</span>
          <span style={foundingBannerArrowStyle}>Apply now →</span>
        </Link>
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

      <HowItWorksForCreators />

      <HowItWorks />

      <p style={footerLineStyle}>South Africa to the World!</p>
    </main>
  );
}

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

// Pulled up over HeroBanner's fading bottom edge so the banner reads as
// a divider between the hero and the rest of the page, not just another
// stacked section. position+zIndex keeps it painting above the hero.
const foundingBannerSectionStyle: React.CSSProperties = {
  padding: "0 1.75rem",
  maxWidth: "1100px",
  margin: "-5rem auto 2rem",
  position: "relative",
  zIndex: 2,
};

const foundingBannerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.85rem",
  textDecoration: "none",
  color: "var(--text)",
  background: "var(--surface)",
  border: "1px solid var(--accent)",
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
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.25rem 0.75rem",
};

const foundingBannerTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.6rem",
  fontWeight: 600,
};

const foundingBannerArrowStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 700,
  fontSize: "1rem",
};

const footerLineStyle: React.CSSProperties = {
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: "0.85rem",
  fontWeight: 600,
  padding: "0 1.75rem 2.5rem",
  margin: 0,
};
