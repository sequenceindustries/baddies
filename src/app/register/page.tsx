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
} from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
      body: JSON.stringify({ email, password, displayName, confirmsAdult }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }

    router.push("/home");
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
