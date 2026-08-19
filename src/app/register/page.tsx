"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  pageWrapStyle,
  cardStyle,
  displayHeadingStyle,
  Field,
  inputStyle,
  checkboxRowStyle,
  primaryButtonStyle,
  errorBannerStyle,
  LocationField,
} from "@/components/ui";

type Intent = "FAN" | "CREATOR";

export default function RegisterPage() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>("FAN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName, country, city, confirmsAdult }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }

    // Every account starts as a fan (see RegisterSchema) — a creator
    // account additionally needs a legal name and a signed Creator
    // Agreement, which only /apply collects. Choosing "Creator" here just
    // sends them straight into that next step instead of leaving them to
    // discover "Become a creator" in the nav on their own.
    router.push(intent === "CREATOR" ? "/apply" : "/home");
    router.refresh();
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Create your account</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        18+ only. Safe, verified, affordable.
      </p>
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          {error && <div style={errorBannerStyle}>{error}</div>}

          <span style={introLabelStyle}>I&apos;m joining as a...</span>
          <div style={intentRowStyle}>
            <IntentOption
              label="Fan"
              hint="Browse, subscribe, tip."
              active={intent === "FAN"}
              onClick={() => setIntent("FAN")}
            />
            <IntentOption
              label="Creator"
              hint="Post content, get paid."
              active={intent === "CREATOR"}
              onClick={() => setIntent("CREATOR")}
            />
          </div>
          {intent === "CREATOR" && (
            <p style={intentNoteStyle}>
              This account starts as a fan account, same as anyone else — right after you sign up
              we&apos;ll take you to the creator application (a quick identity/age check, no
              approval wait for your posts once you&apos;re verified).
            </p>
          )}

          <Field label="Display name">
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={50}
              required
            />
          </Field>

          <Field label="Email">
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Password" hint="At least 10 characters.">
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
          </Field>

          <LocationField
            country={country}
            city={city}
            onChange={(v) => {
              setCountry(v.country);
              setCity(v.city);
            }}
          />

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

          <button type="submit" style={primaryButtonStyle} disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
      <p style={{ marginTop: "1.25rem", fontSize: "0.88rem", color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--accent-gold)" }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}

function IntentOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={intentOptionStyle(active)}>
      <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>{label}</span>
      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{hint}</span>
    </button>
  );
}

const introLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  fontWeight: 500,
  marginBottom: "0.5rem",
};

const intentRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
  marginBottom: "0.5rem",
};

const intentNoteStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--text-muted)",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0.7rem 0.85rem",
  marginTop: "0.6rem",
  marginBottom: "1.3rem",
  lineHeight: 1.5,
};

function intentOptionStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.2rem",
    padding: "0.7rem 0.85rem",
    borderRadius: "var(--radius)",
    cursor: "pointer",
    textAlign: "left",
    background: active ? "rgba(201, 169, 97, 0.12)" : "var(--surface-raised)",
    border: active ? "1.5px solid var(--accent-gold)" : "1px solid var(--border)",
    color: "var(--text)",
  };
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
