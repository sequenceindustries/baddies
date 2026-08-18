"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface SessionUser {
  id: string;
  email: string;
  role: "FAN" | "CREATOR" | "ADMIN";
  displayName: string | null;
  creatorProfile: { id: string; status: string } | null;
}

/** Fetches /api/auth/me once on mount. Minimal — no global state library for a handful of pages. */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined); // undefined = loading
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);
  return { user, loading: user === undefined, refresh };
}

export function Nav() {
  const { user, loading, refresh } = useSession();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    refresh();
    window.location.href = "/";
  }

  return (
    <nav style={navStyle}>
      <Link href="/" style={{ ...brandStyle, textDecoration: "none" }}>
        Baddies
      </Link>
      <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
        {loading ? null : user ? (
          <>
            <Link href="/home" style={linkStyle}>
              Home
            </Link>
            {user.role !== "ADMIN" && (
              <Link href="/apply" style={linkStyle}>
                {user.creatorProfile ? "Creator status" : "Become a creator"}
              </Link>
            )}
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {user.displayName ?? user.email}
            </span>
            <button onClick={handleLogout} style={ghostButtonStyle}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" style={linkStyle}>
              Sign in
            </Link>
            <Link href="/register" style={primaryLinkStyle}>
              Join
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export function VerifiedBadge() {
  return (
    <span style={badgeStyle}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 12.5l2 2 4.5-5"
          stroke="var(--bg)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="10" fill="var(--accent-gold)" />
        <path
          d="M9 12.5l2 2 4.5-5"
          stroke="var(--bg)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Verified Baddie
    </span>
  );
}

export function Field(props: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: "1.1rem" }}>
      <span style={fieldLabelStyle}>{props.label}</span>
      {props.children}
      {props.hint && <span style={hintStyle}>{props.hint}</span>}
      {props.error && <span style={errorStyle}>{props.error}</span>}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "0.4rem",
  padding: "0.7rem 0.8rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: "0.95rem",
};

export const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  marginBottom: "1.1rem",
  fontSize: "0.88rem",
  color: "var(--text-muted)",
  lineHeight: 1.4,
};

export const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.8rem",
  background: "var(--accent-gold)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.95rem",
  cursor: "pointer",
};

export const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "2rem",
};

export const pageWrapStyle: React.CSSProperties = {
  maxWidth: "440px",
  margin: "3.5rem auto",
  padding: "0 1.5rem",
};

export const displayHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.9rem",
  fontWeight: 500,
  margin: "0 0 0.4rem",
};

export const errorBannerStyle: React.CSSProperties = {
  background: "rgba(217, 115, 106, 0.12)",
  border: "1px solid rgba(217, 115, 106, 0.4)",
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.7rem 0.9rem",
  fontSize: "0.88rem",
  marginBottom: "1.2rem",
};

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "1.1rem 1.75rem",
  borderBottom: "1px solid var(--border)",
};

const brandStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.3rem",
  fontWeight: 600,
  color: "var(--text)",
};

const linkStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  textDecoration: "none",
  fontSize: "0.9rem",
};

const primaryLinkStyle: React.CSSProperties = {
  ...linkStyle,
  color: "var(--accent-gold)",
  fontWeight: 600,
};

const ghostButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.8rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--accent-gold)",
  letterSpacing: "0.02em",
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  fontWeight: 500,
};

const hintStyle: React.CSSProperties = {
  display: "block",
  marginTop: "0.35rem",
  fontSize: "0.78rem",
  color: "var(--text-muted)",
};

const errorStyle: React.CSSProperties = {
  display: "block",
  marginTop: "0.35rem",
  fontSize: "0.78rem",
  color: "var(--danger)",
};
