"use client";

const FAN_TIERS = [
  {
    name: "Teasers",
    desc: "Browse public previews from every verified creator. No cost, no card required.",
  },
  {
    name: "VIP",
    desc: "One VIP Pass — 3, 6 or 12 months, from $3.50/month — unlocks VIP-tier content from every participating creator on the platform.",
  },
  {
    name: "Exclusive",
    desc: "Subscribe directly to a creator for $10/month: subscriber-only posts, live videos, and more.",
  },
];

const CREATOR_STEPS = [
  {
    name: "Join",
    desc: "Join as a creator — open to South African creators only, no exceptions. Get verified once accepted.",
  },
  {
    name: "Publish & earn",
    desc: "Post Teaser previews so fans discover you, opt into the platform-wide VIP tier, and earn from fans who subscribe to your Exclusive content.",
  },
  {
    name: "Get paid",
    desc: "Fans subscribe directly. Payouts go straight to you, on your terms.",
  },
];

/**
 * The fan and creator "how it works" explainers, side by side as two
 * columns — creators on the left, fans on the right — each column
 * stacking its own three blocks. Previously two separate stacked
 * sections (HowItWorks / HowItWorksForCreators, each a 3-across grid);
 * kept as one exported component now that the two audiences read as a
 * single side-by-side comparison rather than sequential sections. Fan
 * tier copy lives in FAN_TIERS/CREATOR_STEPS above so nothing about the
 * two audiences' wording drifted in this reshape.
 */
export function HowItWorks() {
  return (
    <section style={sectionStyle}>
      <div style={columnsGridStyle}>
        <div>
          <h3 style={sectionHeadingStyle}>For creators</h3>
          <div style={blockStackStyle}>
            {CREATOR_STEPS.map((step, i) => (
              <div key={step.name} className="hover-lift" style={tierCardStyle}>
                <span style={stepNumberStyle}>{String(i + 1).padStart(2, "0")}</span>
                <div style={tierNameStyle}>{step.name}</div>
                <p style={tierDescStyle}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 style={sectionHeadingStyle}>For fans</h3>
          <div style={blockStackStyle}>
            {FAN_TIERS.map((tier) => (
              <div key={tier.name} className="hover-lift" style={fansTierCardStyle}>
                <div style={tierNameStyle}>{tier.name}</div>
                <p style={tierDescStyle}>{tier.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "0 clamp(1rem, 4vw, 2.5rem)",
  maxWidth: "1240px",
  margin: "0 auto",
  textAlign: "left",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--accent)",
  margin: "0 0 1rem",
};

// Two columns (creators left, fans right) on wide screens, stacking to
// one column on narrow ones — same auto-fit/minmax trick the old
// tierGridStyle used for its 3-across cards, just applied one level up.
const columnsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "2.5rem",
};

const blockStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

// Borders removed per product decision — background + boxShadow glow
// still separate each block from the page without a hard edge.
const tierCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "var(--radius-lg)",
  padding: "1.75rem 2rem",
};

const stepNumberStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-display)",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "var(--accent)",
  marginBottom: "0.75rem",
};

// A visibly different shade from the creator steps (var(--surface),
// darker) so the two columns still read as distinct at a glance, now
// that color is the only thing telling them apart (no border color).
const fansTierCardStyle: React.CSSProperties = {
  ...tierCardStyle,
  background: "var(--surface-raised)",
};

const tierNameStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.9rem",
  fontWeight: 700,
  textTransform: "uppercase",
  lineHeight: 1,
  marginBottom: "0.6rem",
};

const tierDescStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.95rem",
  lineHeight: 1.5,
  margin: 0,
};
