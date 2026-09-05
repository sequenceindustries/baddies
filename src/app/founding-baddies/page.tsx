"use client";

import { useEffect, useState } from "react";
import { NOT_SOUTH_AFRICA_MESSAGE } from "@/lib/security/geo";
import ApplicationNextSteps from "./ApplicationNextSteps";

/**
 * The Founding Baddies recruitment campaign — landing page + application
 * form, deliberately public (no SignInGate, no auth of any kind). This
 * is the top of the funnel: a prospective creator finds this page
 * (shared on social, in DMs, etc.) before they have any Baddies account
 * at all, so it can never depend on being signed in. Submitting POSTs to
 * /api/founding/apply, a standalone table (FoundingApplication) that
 * isn't tied to a User row — see that route's own comment.
 */
export default function FoundingBaddiesPage() {
  return (
    <main style={pageStyle}>
      <Hero />
      <WhatIsBaddies />
      <Benefits />
      <Monetisation />
      <TrustAndSafety />
      <ApplicationForm />
    </main>
  );
}

function Hero() {
  return (
    <section style={heroStyle}>
      <span style={kickerStyle}>Limited Cohort</span>
      <h1 style={heroTitleStyle}>Become a Founding baddie</h1>
      <p style={heroSubStyle}>
        Join the first generation of African creators building the future of the creator economy.
      </p>
      <a href="#apply" style={heroCtaStyle}>
        Apply Now
      </a>
    </section>
  );
}

function WhatIsBaddies() {
  const points = [
    "A premium platform built for female adult creators",
    "Creators monetise their own content, on their own terms",
    "Fans subscribe directly to the creators they support",
    "Open exclusively to South African creators, no exceptions — built here first, for a global audience",
  ];
  return (
    <Section title="What is baddies?">
      <div className="grid-cols-2">
        {points.map((p) => (
          <div key={p} style={pointCardStyle}>
            <span style={pointBulletStyle} aria-hidden="true" />
            <span style={pointTextStyle}>{p}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Benefits() {
  const benefits = [
    "0% platform commission fees for 6 months, you keep all your income",
    "A Founding baddie badge on your profile",
    "Featured placement across the platform",
    "Priority promotion during campaigns",
    "Dedicated onboarding support",
    "Professional profile & content setup support",
    "Referral opportunity for creators you bring in",
  ];
  return (
    <Section title="Founding baddie benefits" subtitle="What you get for being one of the first.">
      <div className="grid-cols-3">
        {benefits.map((b) => (
          <div key={b} style={benefitCardStyle} className="hover-lift">
            <span style={checkGlyphStyle} aria-hidden="true">
              ✓
            </span>
            <span style={pointTextStyle}>{b}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Monetisation() {
  return (
    <Section title="How You Earn" subtitle="Three tiers. You decide what goes where.">
      <div style={tierGridStyle}>
        <div className="hover-lift" style={tierCardStyle}>
          <div style={tierNameStyle}>Free</div>
          <p style={tierDescStyle}>
            Fans discover you here first — public previews, no cost, no card required.
          </p>
        </div>
        <div className="hover-lift" style={tierCardStyle}>
          <div style={tierNameStyle}>VIP</div>
          <p style={tierDescStyle}>
            One platform-wide membership unlocks selected VIP content from every participating
            creator. You decide what content goes into VIP.
          </p>
        </div>
        <div className="hover-lift" style={{ ...tierCardStyle, borderColor: "var(--accent)" }}>
          <div style={tierNameStyle}>Exclusive</div>
          <p style={tierDescStyle}>
            Fans subscribe directly to you, at the price you set — subscriber-only posts, direct
            messaging, and more.
          </p>
        </div>
      </div>
    </Section>
  );
}

function TrustAndSafety() {
  const points = [
    "18+ only, no exceptions",
    "South African creators only, no exceptions — geo-verified at application",
    "Identity verification required for every creator",
    "Every creator on baddies is verified before they can publish",
    "Your privacy is protected — your data is never sold",
    "Clear safety standards for creators and fans alike",
  ];
  return (
    <Section title="Trust & Safety">
      <div className="grid-cols-3">
        {points.map((p) => (
          <div key={p} style={pointCardStyle}>
            <span style={pointBulletStyle} aria-hidden="true" />
            <span style={pointTextStyle}>{p}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>{title}</h2>
      {subtitle && <p style={sectionSubStyle}>{subtitle}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------
// Application form
// ---------------------------------------------------------------------

const SOCIAL_PLATFORMS = ["Instagram", "TikTok", "X", "YouTube", "Snapchat", "Facebook", "Reddit", "Other"];
const CREATOR_PLATFORMS = ["OnlyFans", "Fansly", "ManyVids", "JustForFans", "LoyalFans", "Patreon", "Other"];

interface PlatformEntry {
  handle: string;
  link: string;
  followers: string;
  customName: string;
}

type PlatformState = Record<string, PlatformEntry>;

const EMPTY_ENTRY: PlatformEntry = { handle: "", link: "", followers: "", customName: "" };

function ApplicationForm() {
  const [fullName, setFullName] = useState("");
  const [stageName, setStageName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [social, setSocial] = useState<PlatformState>({});
  const [creatorPlats, setCreatorPlats] = useState<PlatformState>({});

  const [audienceSize, setAudienceSize] = useState("");
  const [creatingSince, setCreatingSince] = useState("");
  const [currentlyMonetising, setCurrentlyMonetising] = useState("");

  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [agreesToVerification, setAgreesToVerification] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — see hidden field below

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set on a successful submit — drives the step-2 "verify & upload"
  // panel below (see ApplicationNextSteps). Nothing here is sensitive:
  // the id is an unguessable cuid, and the WhatsApp link just points at
  // Baddies' own number with a pre-filled message.
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);

  // Client-side heads-up only, not the enforcement — fails open (assumes
  // eligible) on a slow/failed check so a network hiccup never blocks a
  // real South African applicant; the actual "no exceptions" lock is the
  // POST handler's own getRequestCountry check, which can't be bypassed
  // by skipping this fetch or editing state in devtools.
  const [eligible, setEligible] = useState(true);
  const [checkingEligibility, setCheckingEligibility] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/founding/apply")
      .then((r) => (r.ok ? r.json() : { eligible: true }))
      .then((body: { eligible?: boolean }) => {
        if (!cancelled) setEligible(body.eligible !== false);
      })
      .catch(() => {
        if (!cancelled) setEligible(true);
      })
      .finally(() => {
        if (!cancelled) setCheckingEligibility(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function buildPlatforms() {
    const fromRecord = (record: PlatformState, category: "social" | "creator") =>
      Object.entries(record).map(([option, entry]) => ({
        category,
        platform: option === "Other" ? entry.customName || "Other" : option,
        handle: entry.handle,
        link: entry.link,
        followers: entry.followers,
      }));
    return [...fromRecord(social, "social"), ...fromRecord(creatorPlats, "creator")];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const platforms = buildPlatforms();
    if (platforms.length === 0) {
      setError("Select at least one platform you currently use.");
      return;
    }
    if (!confirmsAdult || !agreesToVerification) {
      setError("Please confirm both checkboxes before submitting.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/founding/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        stageName,
        email,
        phone,
        country,
        city,
        platforms,
        audienceSize: audienceSize || undefined,
        creatingSince: creatingSince || undefined,
        currentlyMonetising: currentlyMonetising ? currentlyMonetising === "yes" : undefined,
        confirmsAdult,
        agreesToVerification,
        website,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }

    const body: { applicationId?: string; whatsappLink?: string } = await res.json().catch(() => ({}));
    setApplicationId(body.applicationId ?? null);
    setWhatsappLink(body.whatsappLink ?? null);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <section id="apply" style={{ ...sectionStyle, ...formSectionStyle }}>
        <div style={successCardStyle}>
          <h2 style={sectionHeadingStyle}>Application received</h2>
          <p style={tierDescStyle}>
            Thank you for applying to become a Founding baddie. Our team reviews every application
            personally — we&apos;ll reach out by email or WhatsApp once yours has been reviewed.
          </p>
        </div>
        {applicationId && <ApplicationNextSteps applicationId={applicationId} whatsappLink={whatsappLink} />}
      </section>
    );
  }

  // Don't show the (unusable) form to a visitor we already know is
  // ineligible — checkingEligibility guards against a flash of this
  // message before the fetch above has even resolved.
  if (!checkingEligibility && !eligible) {
    return (
      <section id="apply" style={{ ...sectionStyle, ...formSectionStyle }}>
        <div style={successCardStyle}>
          <h2 style={sectionHeadingStyle}>South African creators only</h2>
          <p style={tierDescStyle}>{NOT_SOUTH_AFRICA_MESSAGE}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="apply" style={{ ...sectionStyle, ...formSectionStyle }}>
      <h2 style={sectionHeadingStyle}>Apply to become a Founding baddie</h2>
      <p style={sectionSubStyle}>Takes about five minutes. No documents required at this stage.</p>

      <form onSubmit={handleSubmit} style={formStyle}>
        {error && <div style={errorBannerStyle}>{error}</div>}

        <FormFieldset legend="Personal information">
          <FormRow>
            <FormField label="Full name">
              <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </FormField>
            <FormField label="Creator / stage name">
              <input style={inputStyle} value={stageName} onChange={(e) => setStageName(e.target.value)} required />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Email">
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Phone / WhatsApp">
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Country" hint="South Africa only — this cohort has no exceptions.">
              <input style={inputStyle} value={country} onChange={(e) => setCountry(e.target.value)} required />
            </FormField>
            <FormField label="City">
              <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} required />
            </FormField>
          </FormRow>
        </FormFieldset>

        <FormFieldset legend="Platforms" hint="Select every platform you currently use.">
          <PlatformPicker title="Social" options={SOCIAL_PLATFORMS} state={social} onChange={setSocial} />
          <PlatformPicker
            title="Creator platforms"
            options={CREATOR_PLATFORMS}
            state={creatorPlats}
            onChange={setCreatorPlats}
          />
        </FormFieldset>

        <FormFieldset legend="Audience">
          <FormField label="Total audience size" hint="Roughly, across all platforms.">
            <input
              style={inputStyle}
              value={audienceSize}
              onChange={(e) => setAudienceSize(e.target.value)}
              placeholder="e.g. ~50k across platforms"
            />
          </FormField>
        </FormFieldset>

        <FormFieldset legend="About you">
          <FormField label="How long have you been creating content?">
            <input
              style={inputStyle}
              value={creatingSince}
              onChange={(e) => setCreatingSince(e.target.value)}
              placeholder="e.g. 2 years"
            />
          </FormField>
          <FormField label="Are you currently monetising your audience?">
            <select style={inputStyle} value={currentlyMonetising} onChange={(e) => setCurrentlyMonetising(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="yes">Yes</option>
              <option value="no">Not yet</option>
            </select>
          </FormField>
        </FormFieldset>

        <FormFieldset legend="Verification">
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={confirmsAdult}
              onChange={(e) => setConfirmsAdult(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I confirm I am 18 years of age or older.
          </label>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={agreesToVerification}
              onChange={(e) => setAgreesToVerification(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I understand identity verification is required before I can publish on baddies.
          </label>
        </FormFieldset>

        {/* Honeypot — hidden from real visitors via CSS, never via
            type="hidden" (bots fill those in too). A filled value here
            means it wasn't a person; the API accepts and discards it
            silently. */}
        <div style={honeypotStyle} aria-hidden="true">
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" style={submitButtonStyle} disabled={submitting}>
          {submitting ? "Submitting..." : "Become a Founding baddie"}
        </button>
      </form>
    </section>
  );
}

function PlatformPicker({
  title,
  options,
  state,
  onChange,
}: {
  title: string;
  options: string[];
  state: PlatformState;
  onChange: (next: PlatformState) => void;
}) {
  function toggle(option: string) {
    const next = { ...state };
    if (next[option]) {
      delete next[option];
    } else {
      next[option] = { ...EMPTY_ENTRY };
    }
    onChange(next);
  }

  function updateEntry(option: string, patch: Partial<PlatformEntry>) {
    const current = state[option] ?? EMPTY_ENTRY;
    onChange({ ...state, [option]: { ...current, ...patch } });
  }

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <span style={platformGroupLabelStyle}>{title}</span>
      <div style={platformOptionsGridStyle}>
        {options.map((option) => {
          const entry = state[option];
          return (
            <div key={option} style={platformOptionWrapStyle}>
              <label style={platformCheckboxRowStyle}>
                <input type="checkbox" checked={Boolean(entry)} onChange={() => toggle(option)} />
                {option}
              </label>
              {entry && (
                <div style={platformDetailGridStyle}>
                  {option === "Other" && (
                    <input
                      style={inputStyle}
                      placeholder="Platform name"
                      value={entry.customName}
                      onChange={(e) => updateEntry(option, { customName: e.target.value })}
                    />
                  )}
                  <input
                    style={inputStyle}
                    placeholder="Username / handle"
                    value={entry.handle}
                    onChange={(e) => updateEntry(option, { handle: e.target.value })}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Profile link"
                    value={entry.link}
                    onChange={(e) => updateEntry(option, { link: e.target.value })}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Followers / subscribers"
                    value={entry.followers}
                    onChange={(e) => updateEntry(option, { followers: e.target.value })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormFieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>{legend}</legend>
      {hint && <p style={fieldsetHintStyle}>{hint}</p>}
      {children}
    </fieldset>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div style={formRowStyle}>{children}</div>;
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={fieldWrapStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
      {hint && <span style={fieldHintStyle}>{hint}</span>}
    </label>
  );
}

function formatError(body: unknown): string {
  if (!body || typeof body !== "object") return "Something went wrong. Please try again.";
  const err = (body as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "fieldErrors" in err) {
    const fieldErrors = (err as { fieldErrors: Record<string, string[]> }).fieldErrors;
    const first = Object.values(fieldErrors).flat().find(Boolean);
    if (first) return first;
  }
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------

const pageStyle: React.CSSProperties = { paddingBottom: "2rem" };

const heroStyle: React.CSSProperties = {
  padding: "5.5rem 1.75rem 3.5rem",
  maxWidth: "760px",
  margin: "0 auto",
  textAlign: "center",
};

const kickerStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.4rem 1rem",
  marginBottom: "1.75rem",
};

const heroTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(2.4rem, 6vw, 3.8rem)",
  fontWeight: 600,
  margin: "0 0 1.1rem",
  lineHeight: 1.1,
};

const heroSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "1.1rem",
  lineHeight: 1.65,
  maxWidth: "540px",
  margin: "0 auto 2.25rem",
};

const heroCtaStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "999px",
  padding: "1rem 2.5rem",
  fontWeight: 700,
  fontSize: "1rem",
  textDecoration: "none",
  display: "inline-block",
  boxShadow: "0 8px 30px -8px rgba(59, 130, 246, 0.55)",
};

const sectionStyle: React.CSSProperties = {
  padding: "3.5rem 1.75rem",
  maxWidth: "1000px",
  margin: "0 auto",
  borderTop: "1px solid var(--border)",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.9rem",
  fontWeight: 500,
  margin: "0 0 0.6rem",
  textAlign: "center",
};

const sectionSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.98rem",
  textAlign: "center",
  margin: "0 auto 2.5rem",
  maxWidth: "520px",
};

const pointCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.75rem",
  fontSize: "0.95rem",
  color: "var(--text)",
  lineHeight: 1.5,
};

// main {text-align: center} (globals.css) inherits down into these card
// spans by default — fine for a single short line, but once text wraps
// onto 2-3 lines it visually detaches the wrapped lines from the bullet
// sitting at the left. textWrap: "balance" also keeps a wrapped line from
// ending in a single stranded word.
const pointTextStyle: React.CSSProperties = {
  textAlign: "left",
  textWrap: "balance",
};

const pointBulletStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: "var(--accent)",
  marginTop: "0.5rem",
  flexShrink: 0,
};

const benefitCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.75rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "1.25rem 1.4rem",
  fontSize: "0.92rem",
  boxShadow: "var(--glow)",
};

const checkGlyphStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 700,
  flexShrink: 0,
};

const tierGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "1.25rem",
  marginTop: "1.5rem",
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
  marginBottom: "0.35rem",
};

const tierDescStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.88rem",
  lineHeight: 1.55,
  margin: 0,
};

const formSectionStyle: React.CSSProperties = { maxWidth: "720px" };

const formStyle: React.CSSProperties = { marginTop: "1rem" };

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "1.5rem",
  margin: "0 0 1.5rem",
};

const legendStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.02rem",
  fontWeight: 600,
  padding: "0 0.5rem",
};

const fieldsetHintStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.82rem",
  margin: "0 0 1rem",
};

const formRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "1rem",
};

const fieldWrapStyle: React.CSSProperties = { display: "block", marginBottom: "1rem" };

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  fontWeight: 500,
  marginBottom: "0.4rem",
};

const fieldHintStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.76rem",
  color: "var(--text-muted)",
  marginTop: "0.3rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.8rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: "0.92rem",
};

const platformGroupLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.9rem",
  fontWeight: 600,
  marginBottom: "0.75rem",
};

const platformOptionsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "0.6rem",
  marginBottom: "1.25rem",
};

const platformOptionWrapStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "0.6rem 0.75rem",
};

const platformCheckboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const platformDetailGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  marginTop: "0.6rem",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  fontSize: "0.88rem",
  color: "var(--text-muted)",
  marginBottom: "0.85rem",
  cursor: "pointer",
};

// Off-screen rather than display:none/visibility:hidden — those two are
// what unsophisticated bots specifically check for before deciding
// whether to bother filling a field in.
const honeypotStyle: React.CSSProperties = {
  position: "absolute",
  left: "-9999px",
  width: "1px",
  height: "1px",
  overflow: "hidden",
};

const submitButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.95rem",
  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
};

const errorBannerStyle: React.CSSProperties = {
  background: "rgba(217, 115, 106, 0.12)",
  border: "1px solid rgba(217, 115, 106, 0.4)",
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.7rem 0.9rem",
  fontSize: "0.88rem",
  marginBottom: "1.25rem",
};

const successCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "2.5rem",
  textAlign: "center",
  boxShadow: "var(--glow)",
};
