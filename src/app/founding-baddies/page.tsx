"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NOT_SOUTH_AFRICA_MESSAGE } from "@/lib/security/geo";
import { LocationField } from "@/components/ui";

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
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  // Silent, one-shot: a valid Founding Partner referral code sets a
  // signed httpOnly cookie (see GET /api/founding/referral/[code]) that
  // POST /api/founding/apply reads later to attribute the application.
  // No visible confirmation here on purpose — a referred vs. unreferred
  // visitor sees exactly the same page, same reasoning the public
  // homepage keeps referral/partner mechanics off itself entirely.
  useEffect(() => {
    if (!ref) return;
    fetch(`/api/founding/referral/${encodeURIComponent(ref)}`).catch(() => {});
  }, [ref]);

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
      <a href="#apply" style={heroCtaStyle} className="hover-lift">
        Join Now
      </a>
    </section>
  );
}

function WhatIsBaddies() {
  return (
    <Section title="What is baddies?">
      <p style={whatIsSentenceStyle}>
        baddies is a premium platform built exclusively for South African female adult creators to
        monetise their own content on their own terms, with fans subscribing directly to the
        creators they support.
      </p>
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
    <Section title="How it works" subtitle="Three tiers. You decide what goes where.">
      <div style={tierGridStyle}>
        <div className="hover-lift" style={tierCardStyle}>
          <div style={tierNameStyle}>Teasers</div>
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
        <div className="hover-lift" style={tierCardStyle}>
          <div style={tierNameStyle}>Exclusive</div>
          <p style={tierDescStyle}>
            Fans subscribe directly to you, at the price you set — subscriber-only posts, live
            videos, and more.
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
      <div style={trustBoxStyle}>
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

const SOCIAL_PLATFORMS = ["Instagram", "X", "Facebook"];
const CREATOR_PLATFORMS = ["OnlyFans", "Fansly", "JustForFans"];

interface PlatformEntry {
  handle: string;
  link: string;
  customName: string;
  // Creator platforms only (see PlatformPicker's showFollowers) — free
  // text like audienceSize, not a strict number, since "~2.3k" is a
  // perfectly normal answer. Matches the admin Command Centre's own
  // PlatformEntryView.followers field name.
  followers: string;
}

type PlatformState = Record<string, PlatformEntry>;

const EMPTY_ENTRY: PlatformEntry = { handle: "", link: "", customName: "", followers: "" };

function ApplicationForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [stageName, setStageName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  // Already-supported on the backend (FoundingApplication.creatingSince)
  // but not previously collected by this form — added here so the
  // Email/Password/Phone row pairs up evenly instead of leaving Phone
  // dangling alone on its own line at narrower widths.
  const [creatingSince, setCreatingSince] = useState("");

  const [social, setSocial] = useState<PlatformState>({});
  const [creatorPlats, setCreatorPlats] = useState<PlatformState>({});

  const [audienceSize, setAudienceSize] = useState("");

  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [confirmsFemale, setConfirmsFemale] = useState(false);
  const [agreesToVerification, setAgreesToVerification] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — see hidden field below

  const [submitting, setSubmitting] = useState(false);
  // Only ever drives the brief "Taking you to your dashboard…" message
  // below, for the gap between a successful submit and router.push
  // actually landing — see handleSubmit.
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (!confirmsAdult || !confirmsFemale || !agreesToVerification) {
      setError("Please confirm every checkbox before submitting.");
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
        password,
        phone,
        country,
        city,
        creatingSince: creatingSince || undefined,
        platforms,
        audienceSize: audienceSize || undefined,
        confirmsAdult,
        confirmsFemale,
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

    const body: { applicationId?: string } = await res.json().catch(() => ({}));
    if (!body.applicationId) {
      setError("Something went wrong submitting your application. Please try again.");
      return;
    }
    setSubmitted(true);
    // Straight to the real creator profile, not a Founding-specific
    // status page — a Founding Baddie IS a creator applicant from the
    // moment they submit (POST /api/founding/apply now creates a real
    // CreatorProfile at VERIFICATION_REQUIRED alongside the account), so
    // /profile already renders the right thing for them: the real
    // VerificationFlow (identity+ID, live capture, liveness) that lives
    // there now (folded in from the old /creator-dashboard), not a
    // separate bespoke checklist. See that route's own doc comment.
    router.push("/profile");
  }

  // Covers the brief gap between a successful submit and router.push
  // actually landing on the dashboard — without this, the form (still
  // full of what they just typed) would flash back on screen for a
  // moment instead of a clean handoff.
  if (submitted) {
    return (
      <section id="apply" style={{ ...sectionStyle, ...formSectionStyle }}>
        <div style={successCardStyle}>
          <h2 style={sectionHeadingStyle}>Application received</h2>
          <p style={tierDescStyle}>Taking you to your dashboard…</p>
        </div>
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
      <h2 style={sectionHeadingStyle}>Join as a Founding baddie</h2>
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
            <FormField label="Password" hint="At least 10 characters — this creates your Baddies account.">
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                required
              />
            </FormField>
            <FormField label="Phone / WhatsApp">
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </FormField>
            <FormField label="Creating content since" hint="e.g. 2021, or ~3 years">
              <input
                style={inputStyle}
                value={creatingSince}
                onChange={(e) => setCreatingSince(e.target.value)}
              />
            </FormField>
          </FormRow>
          <LocationField country={country} city={city} onChange={(v) => { setCountry(v.country); setCity(v.city); }} />
          <p style={fieldHintStyle}>South Africa only — this cohort has no exceptions.</p>
        </FormFieldset>

        <FormFieldset legend="Platforms" hint="Select every platform you currently use.">
          <PlatformPicker
            title="Social"
            options={SOCIAL_PLATFORMS}
            state={social}
            onChange={setSocial}
            singleField
          />
          <PlatformPicker
            title="Creator platforms"
            options={CREATOR_PLATFORMS}
            state={creatorPlats}
            onChange={setCreatorPlats}
            singleField
            showFollowers
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

        <FormFieldset legend="Verification">
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={confirmsFemale}
              onChange={(e) => setConfirmsFemale(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I confirm I am female — baddies is a platform for female creators.
          </label>
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
  singleField = false,
  showFollowers = false,
}: {
  title: string;
  options: string[];
  state: PlatformState;
  onChange: (next: PlatformState) => void;
  // One merged "Handle or link" input instead of separate handle/link
  // fields — used for both Social and Creator platforms now, where
  // either is equally useful and asking for both is just friction. The
  // merged value is stored in `handle` (PlatformEntry.link stays "" and
  // is simply never sent).
  singleField?: boolean;
  // Creator platforms only — an extra "Number of subscribers" input
  // per selected platform (stored as PlatformEntry.followers), since
  // that's specific to a paid creator platform and doesn't apply to a
  // plain social account.
  showFollowers?: boolean;
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
                  {singleField ? (
                    <input
                      style={inputStyle}
                      placeholder="Handle or link"
                      value={entry.handle}
                      onChange={(e) => updateEntry(option, { handle: e.target.value })}
                    />
                  ) : (
                    <>
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
                    </>
                  )}
                  {showFollowers && (
                    <input
                      style={inputStyle}
                      placeholder="Number of subscribers"
                      value={entry.followers}
                      onChange={(e) => updateEntry(option, { followers: e.target.value })}
                    />
                  )}
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
  // <fieldset>/<legend> kept for real semantics (a screen reader
  // announces the legend as this group's label) but NOT for visuals —
  // a fieldset's background/box-shadow/border-radius only ever paints
  // behind its "content box", which by spec excludes the legend, so
  // styling the <fieldset> itself directly left the legend floating
  // above/outside the box instead of reading as its heading. The actual
  // box is a plain <div> instead, same pattern as Section's own
  // heading-outside-the-box layout above.
  return (
    <fieldset style={fieldsetWrapStyle}>
      <legend style={legendStyle}>{legend}</legend>
      <div style={fieldsetBoxStyle}>
        {hint && <p style={fieldsetHintStyle}>{hint}</p>}
        {children}
      </div>
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

// Border removed per product decision (copying the landing page's
// borderless treatment) — background alone gives the pill enough
// contrast against the hero.
const kickerStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent)",
  background: "var(--surface-raised)",
  borderRadius: "999px",
  padding: "0.4rem 1rem",
  marginBottom: "1.75rem",
};

// whiteSpace: nowrap + a vw-driven lower clamp bound (rather than a
// fixed rem minimum) keeps "Become a Founding baddie" on one line down
// to narrow phone widths instead of wrapping mid-heading.
const heroTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(1rem, 5.5vw, 2.9rem)",
  fontWeight: 600,
  margin: "0 0 1.1rem",
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const heroSubStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "1.1rem",
  lineHeight: 1.65,
  maxWidth: "540px",
  margin: "0 auto 2.25rem",
};

// Restyled to match the landing page's own boxes (countdown units,
// how-it-works cards) — background + glow shadow, no border/gradient —
// instead of the old solid gradient pill.
const heroCtaStyle: React.CSSProperties = {
  background: "var(--surface)",
  color: "var(--accent)",
  borderRadius: "20px",
  padding: "1rem 2.5rem",
  fontWeight: 700,
  fontSize: "1rem",
  textDecoration: "none",
  display: "inline-block",
  boxShadow: "var(--glow)",
};

const sectionStyle: React.CSSProperties = {
  padding: "3.5rem 1.75rem",
  maxWidth: "1000px",
  margin: "0 auto",
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

const whatIsSentenceStyle: React.CSSProperties = {
  color: "var(--text)",
  fontSize: "1.05rem",
  lineHeight: 1.7,
  textAlign: "center",
  maxWidth: "640px",
  margin: "0 auto",
};

// The single-column box Trust & Safety's points live in — background +
// glow shadow, no border, same treatment as every other box on this
// page and on the landing page.
const trustBoxStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.1rem",
  background: "var(--surface)",
  borderRadius: "16px",
  padding: "1.75rem 2rem",
  boxShadow: "var(--glow)",
  maxWidth: "640px",
  margin: "0 auto",
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

// Border removed in favor of a background + glow shadow — same box
// treatment used everywhere else on this page, applied to the form's
// own section groupings too.
// The outer <fieldset> itself now carries no visual styling at all
// (see FormFieldset's own comment on why) — just layout: no default UA
// border/min-width quirks, and the bottom margin that keeps this
// section's box clear of the next section's legend.
const fieldsetWrapStyle: React.CSSProperties = {
  border: "none",
  minWidth: 0,
  padding: 0,
  margin: "0 0 2.5rem",
};

const legendStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.02rem",
  fontWeight: 600,
  padding: 0,
  margin: "0 0 0.9rem",
  width: "100%",
};

// The actual visible box — a plain div, so background/box-shadow/
// border-radius paint exactly the way every other box on this page
// does, with the legend now sitting above it as a normal heading
// rather than a fieldset's special (and here, background-excluded)
// legend box.
const fieldsetBoxStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "14px",
  padding: "1.5rem",
  boxShadow: "var(--glow)",
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
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.7rem 0.9rem",
  fontSize: "0.88rem",
  marginBottom: "1.25rem",
};

const successCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "16px",
  padding: "2.5rem",
  textAlign: "center",
  boxShadow: "var(--glow)",
};
