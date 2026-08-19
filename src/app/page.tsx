"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/components/ui";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";

interface DiscoveryResponse {
  creators: CreatorCardData[];
}

/**
 * The real landing page (Sprint 0's placeholder replaced) — an anonymous
 * visitor's actual entry point. Logged-in visitors skip straight to
 * /home; this is purely for signed-out discovery + sign-up, OnlyFans-
 * style: content and creators front and center, tiers explained plainly,
 * join/sign-in CTAs everywhere that matters.
 */
export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [newCreators, setNewCreators] = useState<CreatorCardData[]>([]);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/new-creators")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body: DiscoveryResponse) => {
        if (!cancelled) setNewCreators(body.creators ?? []);
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
        <h1 style={heroTitleStyle}>Baddies</h1>
        <p style={heroTaglineStyle}>Safe. Verified. Affordable.</p>
        <p style={heroSubStyle}>
          A creator marketplace built on trust — every creator is identity, age, and liveness
          verified before they can publish. 18+ only.
        </p>
        <div style={heroCtaRowStyle}>
          <Link href="/register" style={primaryCtaStyle}>
            Join free
          </Link>
          <Link href="/login" style={secondaryCtaStyle}>
            Sign in
          </Link>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>How it works</h2>
        <div style={tierGridStyle}>
          <div style={tierCardStyle}>
            <div style={tierNameStyle}>Free</div>
            <p style={tierDescStyle}>Browse public previews from every verified creator. No cost, no card required.</p>
          </div>
          <div style={tierCardStyle}>
            <div style={tierNameStyle}>VIP</div>
            <p style={tierDescStyle}>
              One subscription, unlocks VIP-tier content from every participating creator on the
              platform.
            </p>
          </div>
          <div style={{ ...tierCardStyle, borderColor: "var(--accent-gold)" }}>
            <div style={tierNameStyle}>Exclusive</div>
            <p style={tierDescStyle}>
              Subscribe directly to a creator, at the price they set, for content only their
              subscribers ever see.
            </p>
          </div>
        </div>
      </section>

      {newCreators.length > 0 && (
        <section style={sectionStyle}>
          <CreatorCardRow title="New verified creators" creators={newCreators} />
        </section>
      )}

      <section style={{ ...sectionStyle, textAlign: "center", paddingBottom: "5rem" }}>
        <h2 style={sectionHeadingStyle}>Ready to join?</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          Free to browse. 18+ only. Verified creators, real payouts, no surprises.
        </p>
        <Link href="/register" style={primaryCtaStyle}>
          Create your account
        </Link>
      </section>
    </main>
  );
}

const heroStyle: React.CSSProperties = {
  padding: "5rem 1.75rem 4rem",
  maxWidth: "720px",
  margin: "0 auto",
  textAlign: "center",
};

const heroTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "3rem",
  fontWeight: 500,
  margin: "0 0 0.5rem",
};

const heroTaglineStyle: React.CSSProperties = {
  fontSize: "1.15rem",
  color: "var(--accent-gold)",
  fontWeight: 600,
  margin: "0 0 1rem",
};

const heroSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.95rem",
  lineHeight: 1.6,
  maxWidth: "480px",
  margin: "0 auto 2rem",
};

const heroCtaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  justifyContent: "center",
  flexWrap: "wrap",
};

const primaryCtaStyle: React.CSSProperties = {
  background: "var(--accent-gold)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.8rem 1.6rem",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
  display: "inline-block",
};

const secondaryCtaStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0.8rem 1.6rem",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
  display: "inline-block",
};

const sectionStyle: React.CSSProperties = {
  padding: "1.5rem 1.75rem",
  maxWidth: "1100px",
  margin: "0 auto 1.5rem",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.4rem",
  fontWeight: 500,
  margin: "0 0 1.25rem",
  textAlign: "center",
};

const tierGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "1.25rem",
};

const tierCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "1.5rem",
};

const tierNameStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.15rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
};

const tierDescStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.88rem",
  lineHeight: 1.5,
  margin: 0,
};
