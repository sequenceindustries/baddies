"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Landing page for the link emailed by sendOnboardingApprovedEmail
 * (src/lib/notifications/onboarding-approved.ts) once an admin approves
 * a Founding Baddie — the token itself (not a bare application id, see
 * that module's own comment) is what proves this visitor is the actual
 * applicant. Fetches /api/founding/onboarding/status first so a repeat
 * visit shows a confirmation instead of re-showing the form.
 */
export default function CompleteOnboardingPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [stageName, setStageName] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [agreements, setAgreements] = useState<AgreementDoc[]>([]);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    fetch(`/api/founding/onboarding/status?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        const body = await res.json();
        setStageName(body.stageName ?? "");
        setAlreadySubmitted(Boolean(body.bankingSubmitted));
        setAgreements(Array.isArray(body.agreements) ? body.agreements : []);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <main style={mainStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (invalid || !token) {
    return (
      <main style={mainStyle}>
        <p style={{ color: "var(--danger)" }}>This link is invalid or has expired.</p>
      </main>
    );
  }

  if (alreadySubmitted) {
    return (
      <main style={mainStyle}>
        <h1 style={headingStyle}>You&apos;re all set, {stageName}</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
          We already have your banking details and agreement acceptance on file. Our team will be in
          touch as your account moves through onboarding.
        </p>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Complete your onboarding, {stageName}</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
        Last step: your banking details for payouts, and the agreements every Baddies creator accepts.
      </p>
      <OnboardingForm token={token} agreements={agreements} onSubmitted={() => setAlreadySubmitted(true)} />
    </main>
  );
}

interface AgreementDoc {
  type: string;
  version: string;
  title: string;
  bodyText: string;
}

function OnboardingForm({
  token,
  agreements,
  onSubmitted,
}: {
  token: string;
  agreements: AgreementDoc[];
  onSubmitted: () => void;
}) {
  const [bankName, setBankName] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("SAVINGS");
  const [branchCode, setBranchCode] = useState("");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAccepted = agreements.length > 0 && agreements.every((a) => accepted[a.type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!allAccepted) {
      setError("Please read and accept all four agreements before continuing.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/founding/onboarding/banking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, bankName, accountHolderName, accountNumber, accountType, branchCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.");
        return;
      }
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
        Private — encrypted at rest, never shown publicly. Only used to pay you.
      </p>
      <input type="text" placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} style={inputStyle} required />
      <input
        type="text"
        placeholder="Account holder name"
        value={accountHolderName}
        onChange={(e) => setAccountHolderName(e.target.value)}
        style={inputStyle}
        required
      />
      <input
        type="text"
        placeholder="Account number"
        value={accountNumber}
        onChange={(e) => setAccountNumber(e.target.value)}
        style={inputStyle}
        required
      />
      <select value={accountType} onChange={(e) => setAccountType(e.target.value)} style={inputStyle}>
        <option value="SAVINGS">Savings</option>
        <option value="CHEQUE">Cheque</option>
        <option value="TRANSMISSION">Transmission</option>
        <option value="OTHER">Other</option>
      </select>
      <input
        type="text"
        placeholder="Branch code"
        value={branchCode}
        onChange={(e) => setBranchCode(e.target.value)}
        style={inputStyle}
        required
      />

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 500, margin: "1rem 0 0" }}>
        Agreements
      </h2>
      {agreements.map((a) => (
        <div key={a.type} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "0.8rem 1rem" }}>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 500 }}>
              {a.title} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({a.version})</span>
            </summary>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                marginTop: "0.5rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {a.bodyText}
            </p>
          </details>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.6rem", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              checked={Boolean(accepted[a.type])}
              onChange={(e) => setAccepted((prev) => ({ ...prev, [a.type]: e.target.checked }))}
            />
            I have read and accept the {a.title}.
          </label>
        </div>
      ))}

      {error && <p style={{ fontSize: "0.85rem", color: "var(--danger)", margin: 0 }}>{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        style={{
          marginTop: "0.5rem",
          padding: "0.7rem 1.4rem",
          borderRadius: "8px",
          border: "none",
          background: "var(--accent)",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.95rem",
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        {submitting ? "Submitting…" : "Complete onboarding"}
      </button>
    </form>
  );
}

const mainStyle: React.CSSProperties = { padding: "4rem 1.75rem", maxWidth: "720px", margin: "0 auto" };
const headingStyle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500 };
const inputStyle: React.CSSProperties = {
  padding: "0.55rem 0.7rem",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "0.9rem",
};
