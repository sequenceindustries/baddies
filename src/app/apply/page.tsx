"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/ui";
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

const STATUS_COPY: Record<string, string> = {
  PENDING: "Application received.",
  VERIFICATION_REQUIRED: "Awaiting identity, age, and liveness verification.",
  UNDER_REVIEW: "Verification complete — awaiting admin approval.",
  VERIFIED: "You're a Verified Baddie.",
  SUSPENDED: "Your creator account is suspended.",
  REJECTED: "Your application was not approved.",
  BANNED: "Your creator account has been banned.",
};

export default function ApplyPage() {
  const router = useRouter();
  const { user, loading } = useSession();

  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [bio, setBio] = useState("");
  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [agreesToCreatorAgreement, setAgreesToCreatorAgreement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ status: string } | null>(null);

  if (loading) {
    return <main style={pageWrapStyle} />;
  }

  if (!user) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
        <p style={{ color: "var(--text-muted)" }}>
          You need an account before applying to become a creator.
        </p>
      </main>
    );
  }

  const existingStatus = submitted?.status ?? user.creatorProfile?.status;
  if (existingStatus) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Creator application</h1>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: "0.95rem" }}>
            <strong>Status:</strong> {existingStatus}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.6rem" }}>
            {STATUS_COPY[existingStatus] ?? "Application on file."}
          </p>
        </div>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/creator/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        legalName,
        bio: bio || undefined,
        confirmsAdult,
        agreesToCreatorAgreement,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }

    const body = await res.json();
    setSubmitted({ status: body.status });
    router.refresh();
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Apply to become a creator</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        Your legal name is encrypted and never shown publicly. Your stage name is what fans see.
      </p>
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          {error && <div style={errorBannerStyle}>{error}</div>}

          <Field label="Stage name" hint="What fans will see on your profile.">
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={50}
              required
            />
          </Field>

          <Field label="Legal name" hint="Private. Encrypted at rest. Never shown publicly.">
            <input
              style={inputStyle}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </Field>

          <Field label="Bio" hint="Optional.">
            <textarea
              style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={2000}
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

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={agreesToCreatorAgreement}
              onChange={(e) => setAgreesToCreatorAgreement(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I accept the Creator Agreement.
          </label>

          <button type="submit" style={primaryButtonStyle} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit application"}
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
