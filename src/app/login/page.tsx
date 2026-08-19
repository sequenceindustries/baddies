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
  primaryButtonStyle,
  errorBannerStyle,
  roleHomePath,
  type SessionUser,
} from "@/components/ui";

type Intent = "FAN" | "CREATOR";

const COPY: Record<Intent, { subtitle: string; cta: string; registerHint: string }> = {
  FAN: {
    subtitle: "Welcome back.",
    cta: "Sign in",
    registerHint: "Create an account",
  },
  CREATOR: {
    subtitle: "Welcome back, Baddie.",
    cta: "Sign in",
    registerHint: "Become a creator",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>("FAN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Invalid email or password.");
      return;
    }

    const body: { role: SessionUser["role"] } = await res.json();
    router.push(roleHomePath(body.role));
    router.refresh();
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Sign in</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem", fontSize: "0.92rem" }}>
        {COPY[intent].subtitle}
      </p>

      {/* Sign-in itself is one email/password form either way — your
          account's actual role decides where you land (see roleHomePath
          below). This tab just gets each kind of visitor to the right
          headspace and the right "new here?" link, matching /register's
          fan/creator split. */}
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

      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          {error && <div style={errorBannerStyle}>{error}</div>}

          <Field label="Email">
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Password">
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <button type="submit" style={primaryButtonStyle} disabled={submitting}>
            {submitting ? "Signing in..." : COPY[intent].cta}
          </button>
        </form>
      </div>
      <p style={{ marginTop: "1.25rem", fontSize: "0.88rem", color: "var(--text-muted)" }}>
        New here?{" "}
        <Link href="/register" style={{ color: "var(--accent)" }}>
          {COPY[intent].registerHint}
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

const intentRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
  marginBottom: "1.5rem",
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
    background: active ? "var(--accent-soft)" : "var(--surface-raised)",
    border: active ? "1.5px solid var(--accent)" : "1px solid var(--border)",
    color: "var(--text)",
  };
}
