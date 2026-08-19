"use client";

/**
 * The Free/VIP/Exclusive tier explainer — shared between the landing
 * page (signed-out visitors) and fan Home (signed-in fans, as a
 * reminder at the bottom of the page). One definition so the copy for
 * what each tier means can't drift between the two.
 */
export function HowItWorks() {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>How it works</h2>
      <div style={tierGridStyle}>
        <div className="hover-lift" style={tierCardStyle}>
          <div style={tierNameStyle}>Free</div>
          <p style={tierDescStyle}>Browse public previews from every verified creator. No cost, no card required.</p>
        </div>
        <div className="hover-lift" style={tierCardStyle}>
          <div style={tierNameStyle}>VIP</div>
          <p style={tierDescStyle}>
            One subscription, unlocks VIP-tier content from every participating creator on the
            platform.
          </p>
        </div>
        <div className="hover-lift" style={{ ...tierCardStyle, borderColor: "var(--accent-gold)" }}>
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
