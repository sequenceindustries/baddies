"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "baddies_age_confirmed";

/**
 * Blocks the entire site — nav included — behind an 18+ confirmation on
 * first visit. Nothing else in the tree renders until this resolves:
 * confirmed === null (still checking localStorage) and
 * confirmed === false (declared under 18, or hasn't answered yet) both
 * render only the gate, never `children`, so there's no flash of real
 * content and no way to interact with the page underneath it.
 * Confirmation is remembered in localStorage so a returning visitor
 * doesn't see this every single page load, only once per browser.
 */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    setConfirmed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function confirm() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setConfirmed(true);
  }

  function decline() {
    window.location.href = "https://www.google.com";
  }

  if (confirmed) return <>{children}</>;

  // Also covers the confirmed === null (still checking storage) case —
  // rendering the gate as the default rather than a blank screen means
  // a first-time visitor sees it immediately, no flicker either way.
  return (
    <div style={backdropStyle}>
      <div style={cardStyle}>
        <div style={kickerStyle}>18+ only</div>
        <h1 style={titleStyle}>Age verification required</h1>
        <p style={bodyStyle}>
          baddies is an adult content marketplace. You must be 18 years of age or older — or the
          age of majority in your jurisdiction, whichever is higher — to enter.
        </p>
        <div style={buttonRowStyle}>
          <button onClick={confirm} style={enterButtonStyle}>
            I am 18 or older — Enter
          </button>
          <button onClick={decline} style={exitButtonStyle}>
            I am under 18 — Exit
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.75rem",
};

const cardStyle: React.CSSProperties = {
  maxWidth: "440px",
  width: "100%",
  textAlign: "center",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "2.5rem 2rem",
  boxShadow: "var(--glow)",
};

const kickerStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--accent)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.3rem 0.85rem",
  marginBottom: "1.25rem",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.6rem",
  fontWeight: 600,
  margin: "0 0 0.85rem",
};

const bodyStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.6,
  margin: "0 0 1.75rem",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const enterButtonStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "999px",
  padding: "0.9rem 1.5rem",
  fontWeight: 700,
  fontSize: "0.95rem",
  cursor: "pointer",
};

const exitButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.85rem 1.5rem",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
};
