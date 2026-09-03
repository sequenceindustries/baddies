"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, roleHomePath } from "@/components/ui";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { HowItWorks } from "@/components/how-it-works";

interface DiscoveryResponse {
  creators: CreatorCardData[];
}

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
      <section style={heroStyle}>
        <h1 style={heroTitleStyle}>baddies</h1>
      </section>

      <section style={sectionStyle}>
        <Link href="/founding-baddies" style={foundingBannerStyle} className="hover-lift">
          <span style={foundingBannerKickerStyle}>Now recruiting</span>
          <span style={foundingBannerTitleStyle}>Become a Founding Baddie</span>
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
          <CreatorCardRow title="Top baddies" creators={topCreators} size="lg" scroll />
        </section>
      )}

      <HowItWorks />

      <p style={footerLineStyle}>South Africa to the World!</p>
    </main>
  );
}

const heroStyle: React.CSSProperties = {
  padding: "6rem 1.75rem 4.5rem",
  maxWidth: "760px",
  margin: "0 auto",
  textAlign: "center",
};

const heroTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(3.2rem, 8vw, 5.5rem)",
  fontWeight: 600,
  margin: "0 0 0.6rem",
  lineHeight: 1,
  background: "linear-gradient(135deg, var(--text) 30%, var(--accent) 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const sectionStyle: React.CSSProperties = {
  padding: "1.5rem 1.75rem",
  maxWidth: "1100px",
  margin: "0 auto 1.5rem",
};

const foundingBannerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.6rem 1.25rem",
  textDecoration: "none",
  color: "var(--text)",
  background: "var(--surface)",
  border: "1px solid var(--accent)",
  borderRadius: "16px",
  padding: "1.5rem 2rem",
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
  fontSize: "1.15rem",
  fontWeight: 600,
};

const foundingBannerArrowStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 700,
  fontSize: "0.9rem",
};

const footerLineStyle: React.CSSProperties = {
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: "0.85rem",
  fontWeight: 600,
  padding: "0 1.75rem 2.5rem",
  margin: 0,
};
