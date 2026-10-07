"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { transitions } from "@/lib/motion/tokens";
import { useSession, roleHomePath, Reveal } from "@/components/ui";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { HowItWorks } from "@/components/how-it-works";

interface DiscoveryResponse {
  creators: CreatorCardData[];
}

/**
 * The landing page — an anonymous visitor's entry point; signed-in
 * visitors go straight to their home (roleHomePath, the feed).
 *
 * Editorial layout (dayos-inspired): a left-aligned hero with a huge
 * condensed all-caps headline, pill CTAs and a fanned stack of real
 * creator previews; then full-width sections with rounded tops that
 * alternate near-black and navy, a three-tier pricing row, and one big
 * closing creator call to action.
 */
export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [topCreators, setTopCreators] = useState<CreatorCardData[]>([]);
  const reduceMotion = useReducedMotion();

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
  // while that's still loading (every visitor's first paint).
  if (user) return null;

  const heroImages = topCreators
    .filter((c) => c.thumbnailUrl && !c.thumbnailMimeType?.startsWith("video/"))
    .slice(0, 3);

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { ...transitions.large, delay },
        };

  return (
    <main style={{ textAlign: "left" }}>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section style={heroSectionStyle}>
        <div className="landing-hero-grid" style={containerStyle}>
          <div>
            <motion.span style={eyebrowStyle} {...rise(0)}>
              Africa&apos;s creator network · 18+
            </motion.span>
            <motion.h1 style={heroHeadlineStyle} {...rise(0.06)}>
              <span className="landing-hero-line">Verified creators.</span>
              <span className="landing-hero-line" style={{ color: "var(--accent)" }}>
                Exclusive content.
              </span>
            </motion.h1>
            <motion.p style={heroSubStyle} {...rise(0.14)}>
              Verified South African creators publish exclusive content and get paid directly by the fans who
              support them. Join free to see their teasers — no card required.
            </motion.p>
            <motion.div style={ctaRowStyle} {...rise(0.2)}>
              <Link href="/register" style={pillPrimaryStyle} className="hover-lift">
                Join
              </Link>
              <Link href="/discovery" style={pillGhostStyle} className="hover-lift">
                Browse creators
              </Link>
            </motion.div>
          </div>

          {heroImages.length > 0 && (
            <div className="landing-hero-stack" aria-hidden="true" style={heroStackStyle}>
              {heroImages.map((c, i) => (
                <motion.div
                  key={c.creatorProfileId}
                  style={{ ...heroStackCardStyle, ...HERO_STACK_POSITIONS[i] }}
                  initial={reduceMotion ? false : { opacity: 0, y: 30, rotate: 0 }}
                  animate={{ opacity: 1, y: 0, rotate: HERO_STACK_ROTATIONS[i] }}
                  transition={{ ...transitions.large, delay: 0.15 + i * 0.08 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
                  <img src={c.thumbnailUrl!} alt="" style={heroStackImgStyle} />
                  <span style={heroStackNameStyle}>{c.displayName}</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── The Baddest (navy block) ───────────────────────── */}
      {topCreators.length > 0 && (
        <section style={{ ...blockSectionStyle, background: "var(--navy)" }}>
          <Reveal>
            <div style={containerStyle}>
              <div style={sectionHeaderRowStyle}>
                <h2 style={sectionTitleStyle}>The Baddest.</h2>
                <Link href="/discovery" style={sectionLinkStyle}>
                  See everyone →
                </Link>
              </div>
              <CreatorCardRow creators={topCreators} size="lg" scroll />
            </div>
          </Reveal>
        </section>
      )}

      {/* ── How it works ───────────────────────────────────── */}
      <section style={{ ...blockSectionStyle, background: "var(--bg)" }}>
        <Reveal>
          <div style={containerStyle}>
            <h2 style={sectionTitleStyle}>How it works.</h2>
            <p style={sectionSubStyle}>One platform for creators to earn and fans to unlock what they love.</p>
          </div>
          <HowItWorks />
        </Reveal>
      </section>

      {/* ── Pricing ────────────────────────────────────────── */}
      <section style={{ ...blockSectionStyle, background: "var(--surface)" }}>
        <Reveal>
          <div style={containerStyle}>
            <h2 style={sectionTitleStyle}>Simple pricing.</h2>
            <p style={sectionSubStyle}>Prepaid, no auto-renewal, no surprises.</p>
            <div style={pricingGridStyle}>
              {PRICING.map((tier) => (
                <div key={tier.name} style={tier.featured ? pricingCardFeaturedStyle : pricingCardStyle} className="hover-lift">
                  <span style={pricingNameStyle}>{tier.name}</span>
                  <span style={pricingPriceStyle}>{tier.price}</span>
                  <span style={pricingUnitStyle}>{tier.unit}</span>
                  <p style={pricingDescStyle}>{tier.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Creator CTA (navy block) ───────────────────────── */}
      <section style={{ ...blockSectionStyle, background: "var(--navy)" }}>
        <Reveal>
          <div style={containerStyle}>
            <span style={eyebrowStyle}>For creators</span>
            <h2 style={ctaHeadlineStyle}>
              Become
              <br />a baddie.
            </h2>
            <p style={{ ...sectionSubStyle, maxWidth: "520px" }}>
              South African creators only. Get verified, publish Teasers, VIP and Exclusive content, and get paid
              directly by your fans.
            </p>
            <div style={ctaRowStyle}>
              <Link href="/register" style={pillPrimaryStyle} className="hover-lift">
                Join
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer style={footerStyle}>
        <div style={{ ...containerStyle, ...footerInnerStyle }}>
          <div>
            <p style={footerTaglineStyle}>South Africa to the world.</p>
            <a
              href="https://www.instagram.com/baddest.africa/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="baddies on Instagram"
              style={footerSocialLinkStyle}
            >
              <InstagramIcon />
            </a>
          </div>
          <nav style={footerLinksStyle} aria-label="Legal">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} style={footerLinkStyle}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p style={{ ...containerStyle, ...footerCopyrightStyle }}>
          © {new Date().getFullYear()} baddies. All rights reserved.
        </p>
      </footer>
    </main>
  );
}

const PRICING: { name: string; price: string; unit: string; desc: string; featured?: boolean }[] = [
  { name: "Teasers", price: "Free", unit: "always", desc: "Teasers from every verified creator, free with an account. No card required." },
  {
    name: "VIP Pass",
    price: "$3.50",
    unit: "/month, from",
    desc: "One pass unlocks VIP content from every participating creator. 3, 6 or 12 months.",
    featured: true,
  },
  { name: "Exclusive", price: "$10", unit: "/month per creator", desc: "Subscribe directly to a creator for their subscriber-only posts." },
];

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/creator-terms", label: "Creator Terms" },
  { href: "/content-policy", label: "Content Policy" },
  { href: "/age-policy", label: "18+ / Age Policy" },
  { href: "/dmca", label: "DMCA / Copyright" },
  { href: "/contact", label: "Contact" },
];

// Three cards fanned out to the right of the hero headline.
const HERO_STACK_POSITIONS: React.CSSProperties[] = [
  { left: "6%", top: "10%", zIndex: 1 },
  { left: "34%", top: "0%", zIndex: 3 },
  { left: "60%", top: "14%", zIndex: 2 },
];
const HERO_STACK_ROTATIONS = [-8, 2, 9];

const containerStyle: React.CSSProperties = {
  maxWidth: "1240px",
  margin: "0 auto",
  padding: "0 clamp(1rem, 4vw, 2.5rem)",
};

const heroSectionStyle: React.CSSProperties = {
  padding: "clamp(3rem, 9vw, 7rem) 0 clamp(4rem, 8vw, 7rem)",
  overflow: "hidden",
};

const eyebrowStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.78rem",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--accent)",
  marginBottom: "1.25rem",
};

const heroHeadlineStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(2.3rem, 4.6vw, 4.6rem)",
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: "-0.02em",
  textTransform: "uppercase",
  margin: "0 0 1.75rem",
};

const heroSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "clamp(1rem, 1.6vw, 1.2rem)",
  lineHeight: 1.55,
  maxWidth: "500px",
  margin: "0 0 2rem",
};

const ctaRowStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.75rem" };

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "48px",
  padding: "0 1.6rem",
  borderRadius: "999px",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
};

const pillPrimaryStyle: React.CSSProperties = {
  ...pillBase,
  background: "var(--accent)",
  color: "var(--on-accent)",
};

const pillGhostStyle: React.CSSProperties = {
  ...pillBase,
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--slate)",
};

const heroStackStyle: React.CSSProperties = { position: "relative", minHeight: "460px" };

const heroStackCardStyle: React.CSSProperties = {
  position: "absolute",
  width: "40%",
  aspectRatio: "3 / 4",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
  background: "var(--surface-raised)",
  boxShadow: "0 30px 60px -25px rgba(0, 0, 0, 0.8)",
};

const heroStackImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

const heroStackNameStyle: React.CSSProperties = {
  position: "absolute",
  left: "0.9rem",
  bottom: "0.8rem",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "1.2rem",
  textTransform: "uppercase",
  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
};

// Full-width blocks with rounded tops, stacked so each one overlaps the
// previous section's bottom edge — the dayos section transition.
const blockSectionStyle: React.CSSProperties = {
  borderRadius: "clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px) 0 0",
  marginTop: "calc(-1 * clamp(24px, 4vw, 48px))",
  padding: "clamp(3.5rem, 7vw, 6rem) 0 clamp(4.5rem, 8vw, 7rem)",
  position: "relative",
};

const sectionHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.75rem",
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(2rem, 4.4vw, 3.6rem)",
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: "-0.02em",
  textTransform: "uppercase",
  margin: "0 0 0.75rem",
};

const sectionSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "1.05rem",
  lineHeight: 1.55,
  margin: "0 0 2.25rem",
};

const sectionLinkStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 600,
  textDecoration: "none",
  marginBottom: "0.9rem",
};

const pricingGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "1rem",
};

const pricingCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
  borderRadius: "var(--radius-lg)",
  padding: "2rem",
};

const pricingCardFeaturedStyle: React.CSSProperties = {
  ...pricingCardStyle,
  background: "linear-gradient(160deg, var(--accent-violet) 0%, var(--navy) 100%)",
};

const pricingNameStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const pricingPriceStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "4rem",
  fontWeight: 800,
  lineHeight: 1,
  marginTop: "1rem",
};

const pricingUnitStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" };

const pricingDescStyle: React.CSSProperties = {
  color: "var(--text)",
  opacity: 0.85,
  fontSize: "0.95rem",
  lineHeight: 1.5,
  margin: "1.5rem 0 0",
};

const ctaHeadlineStyle: React.CSSProperties = {
  ...sectionTitleStyle,
  fontSize: "clamp(2.4rem, 7vw, 5.6rem)",
  lineHeight: 1,
  margin: "0 0 1.5rem",
};

const footerStyle: React.CSSProperties = {
  borderRadius: "clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px) 0 0",
  marginTop: "calc(-1 * clamp(24px, 4vw, 48px))",
  background: "var(--bg)",
  padding: "3.5rem 0 2rem",
  position: "relative",
};

const footerInnerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "2rem",
  flexWrap: "wrap",
};

const footerTaglineStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "2rem",
  fontWeight: 800,
  textTransform: "uppercase",
  lineHeight: 1,
  margin: "0 0 1rem",
};

const footerLinksStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(140px, auto))",
  gap: "0.6rem 2rem",
  alignContent: "start",
};

const footerLinkStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.88rem",
  textDecoration: "none",
};

const footerSocialLinkStyle: React.CSSProperties = { display: "inline-flex", color: "var(--text-muted)" };

const footerCopyrightStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.78rem",
  opacity: 0.75,
  marginTop: "2.5rem",
};

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
    </svg>
  );
}
