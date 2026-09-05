"use client";

/**
 * The Free/VIP/Exclusive tier explainer — shared between the landing
 * page (signed-out visitors) and fan Home (signed-in fans, as a
 * reminder at the bottom of the page). One definition so the copy for
 * what each tier means can't drift between the two. Named "for fans"
 * specifically because the landing page also carries HowItWorksForCreators
 * below — two different audiences, two different explanations.
 */
export function HowItWorks() {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>How it works for fans</h2>
      <div style={tierGridStyle}>
        <div className="hover-lift" style={fansTierCardStyle}>
          <div style={tierNameStyle}>Free</div>
          <p style={tierDescStyle}>Browse public previews from every verified creator. No cost, no card required.</p>
        </div>
        <div className="hover-lift" style={fansTierCardStyle}>
          <div style={tierNameStyle}>VIP</div>
          <p style={tierDescStyle}>
            One subscription, unlocks VIP-tier content from every participating creator on the
            platform.
          </p>
        </div>
        <div className="hover-lift" style={fansTierCardStyle}>
          <div style={tierNameStyle}>Exclusive</div>
          <p style={tierDescStyle}>
            Subscribe directly to a creator, at the price they set: subscriber-only posts, direct
            messaging, live videos, tipping, and 1-on-1 video calls.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The creator-side counterpart to HowItWorks (above) — currently only on
 * the landing page, for a prospective creator scrolling past the fan
 * explainer. Three steps, not three tiers: apply, publish and price your
 * own Exclusive tier, then get paid — deliberately light on specifics
 * (no revenue-share percentage, no tier pricing) since that's exactly
 * the kind of number the Founding Baddies page itself no longer states
 * up front; see that page's own Monetisation section.
 */
export function HowItWorksForCreators() {
  const steps = [
    {
      name: "Join",
      desc: "Join as a Founding baddie — open to South African creators only, no exceptions. Get verified once accepted.",
    },
    {
      name: "Publish & set your price",
      desc: "Post Free previews so fans discover you, opt into the platform-wide VIP tier, and set your own price for Exclusive subscribers.",
    },
    {
      name: "Get paid",
      desc: "Fans subscribe and tip directly. Payouts go straight to you, on your terms.",
    },
  ];
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>How it works for creators</h2>
      <div style={tierGridStyle}>
        {steps.map((step) => (
          <div key={step.name} className="hover-lift" style={creatorsTierCardStyle}>
            <div style={tierNameStyle}>{step.name}</div>
            <p style={tierDescStyle}>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "1.5rem 1.75rem",
  maxWidth: "1100px",
  margin: "0 auto 1.5rem",
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

// A visibly different shade from the creator steps below (var(--surface),
// darker) so the two sections read as distinct at a glance while
// scrolling past both, not just distinguished by their headings.
const fansTierCardStyle: React.CSSProperties = {
  ...tierCardStyle,
  background: "var(--surface-raised)",
  borderColor: "var(--accent)",
};

// The app's one other defined brand color (see globals.css's own
// comment on --accent-wine) — used here, not per-role theming, just to
// give the creator steps a different color from the fans tiers above,
// as asked.
const creatorsTierCardStyle: React.CSSProperties = {
  ...tierCardStyle,
  borderColor: "var(--accent-wine)",
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
