"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

interface StatusResponse {
  valid: boolean;
  reason?: "missing_token" | "invalid_token" | "already_accepted" | "revoked" | "expired" | "agreement_unavailable";
  email?: string;
  agreement?: { title: string; version: string; bodyText: string };
}

const REASON_COPY: Record<string, string> = {
  missing_token: "This invitation link is missing its token.",
  invalid_token: "This invitation link isn't valid.",
  already_accepted: "This invitation has already been used.",
  revoked: "This invitation has been revoked.",
  expired: "This invitation has expired.",
  agreement_unavailable: "Something went wrong loading the agreement — try again shortly.",
};

/**
 * Private, invite-only accept flow for a Founding Partner — reachable
 * pre-launch (see src/middleware.ts's PUBLIC_PATHS) but only ever useful
 * with a real, valid token; a visitor with no token just sees the
 * "invalid" state, never a generic public sign-up form.
 */
export default function PartnerInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [agreesToPartnerAgreement, setAgreesToPartnerAgreement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/partner-invite/status?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ valid: false, reason: "invalid_token" }));
  }, [token]);

  if (!status) {
    return <main style={pageWrapStyle} />;
  }

  if (!status.valid) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Founding Partner invitation</h1>
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            {REASON_COPY[status.reason ?? "invalid_token"]}
          </p>
        </div>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/partner-invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, displayName, password, agreesToPartnerAgreement }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }

    router.push("/partner-dashboard");
    router.refresh();
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Become a Founding Partner</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.92rem" }}>
        You&apos;ve been invited to activate a Founding Partner account for <strong>{status.email}</strong>.
        Review the agreement below, then set a password to activate your private dashboard.
      </p>

      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
          {status.agreement?.title} ({status.agreement?.version})
        </h2>
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            whiteSpace: "pre-wrap",
            maxHeight: "260px",
            overflowY: "auto",
            paddingRight: "0.5rem",
          }}
        >
          {status.agreement?.bodyText}
        </div>
      </div>

      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          {error && <div style={errorBannerStyle}>{error}</div>}

          <Field label="Your name" hint="Shown to admins; used to address you.">
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={50}
              required
            />
          </Field>

          <Field label="Password" hint="At least 10 characters.">
            <input
              type="password"
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
          </Field>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={agreesToPartnerAgreement}
              onChange={(e) => setAgreesToPartnerAgreement(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I have read and accept the Founding Partner Agreement above.
          </label>

          <button type="submit" style={primaryButtonStyle} disabled={submitting}>
            {submitting ? "Activating..." : "Activate my account"}
          </button>
        </form>
      </div>
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
