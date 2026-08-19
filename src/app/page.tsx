"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, roleHomePath } from "@/components/ui";
import { CreatorCardRow, ContentCard, type CreatorCardData, type ContentCardData } from "@/components/cards";

interface DiscoveryResponse {
  creators: CreatorCardData[];
}

interface RecentContentItem extends ContentCardData {
  creatorProfileId: string;
  creatorDisplayName: string | null;
  creatorAvatarUrl: string | null;
}

/**
 * The real landing page (Sprint 0's placeholder replaced) — an anonymous
 * visitor's actual entry point. Logged-in visitors skip straight to their
 * role's home (roleHomePath — a creator lands on their Dashboard, not a
 * fan-oriented feed); this is purely for signed-out discovery + sign-up,
 * OnlyFans-style: content and creators front and center, tiers explained
 * plainly, join/sign-in CTAs everywhere that matters.
 */
export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [newCreators, setNewCreators] = useState<CreatorCardData[]>([]);
  const [recentContent, setRecentContent] = useState<RecentContentItem[]>([]);

  useEffect(() => {
    if (!loading && user) {
      router.replace(roleHomePath(user.role));
    }
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/new-creators")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body: DiscoveryResponse) => {
        if (!cancelled) setNewCreators(body.creators ?? []);
      });
    fetch("/api/discovery/recent-content")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((body: { items: RecentContentItem[] }) => {
        if (!cancelled) setRecentContent(body.items ?? []);
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
        <span style={kickerStyle}>🇿🇦 South African-born · Global from day one</span>
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
          <div className="hover-lift" style={tierCardStyle}>
            <div style={tierIconStyle}>🔓</div>
            <div style={tierNameStyle}>Free</div>
            <p style={tierDescStyle}>Browse public previews from every verified creator. No cost, no card required.</p>
          </div>
          <div className="hover-lift" style={tierCardStyle}>
            <div style={tierIconStyle}>⭐</div>
            <div style={tierNameStyle}>VIP</div>
            <p style={tierDescStyle}>
              One subscription, unlocks VIP-tier content from every participating creator on the
              platform.
            </p>
          </div>
          <div className="hover-lift" style={{ ...tierCardStyle, borderColor: "var(--accent-gold)" }}>
            <div style={tierIconStyle}>💎</div>
            <div style={tierNameStyle}>Exclusive</div>
            <p style={tierDescStyle}>
              Subscribe directly to a creator, at the price they set: subscriber-only posts, direct
              messaging, live videos, tipping, and 1-on-1 video calls.
            </p>
          </div>
        </div>
      </section>

      {recentContent.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Free right now</h2>
          <div style={previewStripStyle}>
            {recentContent.map((item) => (
              <div key={item.contentId} style={previewCardWrapStyle}>
                <Link href={`/creators/${item.creatorProfileId}`} style={previewCreatorLinkStyle}>
                  <span style={previewAvatarStyle}>
                    {item.creatorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.creatorAvatarUrl} alt="" style={previewAvatarImgStyle} />
                    ) : (
                      (item.creatorDisplayName ?? "?").charAt(0).toUpperCase()
                    )}
                  </span>
                  {item.creatorDisplayName ?? "Unnamed creator"}
                </Link>
                <ContentCard item={item} size="large" autoLoad />
              </div>
            ))}
          </div>
        </section>
      )}

      {newCreators.length > 0 && (
        <section style={sectionStyle}>
          <CreatorCardRow title="New Baddies" creators={newCreators} />
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
  padding: "6rem 1.75rem 4.5rem",
  maxWidth: "760px",
  margin: "0 auto",
  textAlign: "center",
};

const kickerStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "var(--accent-gold)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.35rem 0.9rem",
  marginBottom: "1.5rem",
};

const heroTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(3.2rem, 8vw, 5.5rem)",
  fontWeight: 600,
  margin: "0 0 0.6rem",
  lineHeight: 1,
  background: "linear-gradient(135deg, var(--text) 30%, var(--accent-gold) 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const heroTaglineStyle: React.CSSProperties = {
  fontSize: "1.3rem",
  color: "var(--accent-gold)",
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  fontStyle: "italic",
  margin: "0 0 1.1rem",
};

const heroSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "1.02rem",
  lineHeight: 1.65,
  maxWidth: "480px",
  margin: "0 auto 2.25rem",
};

const heroCtaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  justifyContent: "center",
  flexWrap: "wrap",
};

const primaryCtaStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-gold) 0%, var(--accent-gold-dim) 100%)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "999px",
  padding: "0.95rem 2rem",
  fontWeight: 700,
  fontSize: "1rem",
  textDecoration: "none",
  display: "inline-block",
  boxShadow: "0 8px 30px -8px rgba(224, 184, 74, 0.55)",
};

const secondaryCtaStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.95rem 2rem",
  fontWeight: 700,
  fontSize: "1rem",
  textDecoration: "none",
  display: "inline-block",
};

const sectionStyle: React.CSSProperties = {
  padding: "1.5rem 1.75rem",
  maxWidth: "1100px",
  margin: "0 auto 1.5rem",
};

const tierIconStyle: React.CSSProperties = {
  fontSize: "1.6rem",
  marginBottom: "0.5rem",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.7rem",
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
  borderRadius: "16px",
  padding: "1.75rem",
  boxShadow: "var(--glow)",
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

const previewStripStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.25rem",
  overflowX: "auto",
  paddingBottom: "0.5rem",
};

const previewCardWrapStyle: React.CSSProperties = {
  flex: "0 0 auto",
  width: "300px",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

const previewCreatorLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.88rem",
};

const previewAvatarStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--accent-gold)",
  overflow: "hidden",
  flexShrink: 0,
};

const previewAvatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
