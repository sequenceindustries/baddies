"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface SessionUser {
  id: string;
  email: string;
  role: "FAN" | "CREATOR" | "ADMIN";
  displayName: string | null;
  creatorProfile: { id: string; status: string } | null;
}

export interface DetectedLocation {
  country: string;
  city: string;
}

/**
 * Real-location detection so country/city reflect where someone actually
 * is instead of whatever they feel like typing — per the product
 * decision that location shouldn't be a free-text field anyone can lie
 * on. Uses the browser's own Geolocation API (device GPS/network
 * position, needs the visitor's explicit permission) reverse-geocoded via
 * BigDataCloud's free, keyless, CORS-enabled client-side endpoint — no
 * server round trip, no API key to provision.
 *
 * This can't be airtight (permission can be denied, a VPN can lie to the
 * browser too) so callers still show the result in an editable field
 * rather than a hard-locked one — but the default is always the real,
 * detected value, not a blank box inviting a fabrication.
 */
export function useLocationDetector() {
  const [status, setStatus] = useState<"idle" | "detecting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function detect(): Promise<DetectedLocation | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("error");
        setError("Location isn't available in this browser — enter it manually.");
        resolve(null);
        return;
      }
      setStatus("detecting");
      setError(null);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            const body = await res.json();
            const country: string = body.countryName ?? "";
            const city: string = body.city || body.locality || body.principalSubdivision || "";
            if (!country) throw new Error("No country in response");
            setStatus("done");
            resolve({ country, city });
          } catch {
            setStatus("error");
            setError("Couldn't determine your location — enter it manually.");
            resolve(null);
          }
        },
        () => {
          setStatus("error");
          setError("Location permission denied — enter your location manually.");
          resolve(null);
        },
        { timeout: 10000 }
      );
    });
  }

  return { status, error, detect };
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

/** Where a signed-in visitor's "home" is — used right after login/register, and by the landing page's already-signed-in redirect. */
export function roleHomePath(role: SessionUser["role"]): string {
  if (role === "ADMIN") return "/admin";
  if (role === "CREATOR") return "/dashboard";
  return "/home";
}

/**
 * Stamps [data-role] on <html> so globals.css can swap --accent (gold for
 * fans, teal for creators, wine-red for admins) — the single mechanism
 * every page's "which mode am I in" coloring hangs off of. Lives in Nav
 * because Nav is the one thing mounted on every page via the root layout.
 * Signed-out visitors get the default (fan/gold) theme.
 */
function useRoleTheme(role: SessionUser["role"] | null | undefined) {
  useEffect(() => {
    const value = role === "CREATOR" ? "creator" : role === "ADMIN" ? "admin" : "fan";
    document.documentElement.setAttribute("data-role", value);
  }, [role]);
}

export function Nav() {
  const { user, loading, refresh } = useSession();
  useRoleTheme(user?.role);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    refresh();
    window.location.href = "/";
  }

  return (
    <div style={navWrapStyle}>
    <nav style={navStyle}>
      <Link href="/" style={{ ...brandStyle, textDecoration: "none" }}>
        Baddies
      </Link>
      <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
        {loading ? null : user ? (
          <>
            {/* Deliberately different link sets per role (not one big list
                with items hidden) — a creator lands on tools for running
                their page, a fan lands on tools for browsing/paying, per
                "creators shouldn't see what fans see." */}
            {user.role === "ADMIN" && (
              <Link href="/admin" style={linkStyle}>
                Admin
              </Link>
            )}
            {user.role === "CREATOR" && (
              <Link href="/dashboard" style={linkStyle}>
                Dashboard
              </Link>
            )}
            {user.role === "FAN" && (
              <>
                <Link href="/home" style={linkStyle}>
                  Home
                </Link>
                <Link href="/subscriptions" style={linkStyle}>
                  My subscriptions
                </Link>
              </>
            )}
            {user.role !== "ADMIN" && (
              <>
                <Link href="/search" style={linkStyle}>
                  Search
                </Link>
                <Link href="/discovery" style={linkStyle}>
                  Discover
                </Link>
                <Link href="/messages" style={linkStyle}>
                  Messages
                </Link>
              </>
            )}
            {user.role === "FAN" && !user.creatorProfile && (
              <Link href="/apply" style={primaryLinkStyle}>
                Become a creator
              </Link>
            )}
            <Link href="/settings" style={linkStyle}>
              Settings
            </Link>
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {user.displayName ?? user.email}
            </span>
            <AccountTypeBadge role={user.role} creatorProfile={user.creatorProfile} />
            <button onClick={handleLogout} style={ghostButtonStyle}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/search" style={linkStyle}>
              Search
            </Link>
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
    <div style={navAccentBarStyle} aria-hidden="true" />
    </div>
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

/**
 * Always-visible account-type pill — the whole point is that a signed-in
 * person should never have to guess whether they're looking at a fan
 * account or a creator account. Creator gets its onboarding status
 * appended (e.g. "Creator · Pending") since "Creator" alone doesn't say
 * whether they can actually publish/monetise yet.
 */
function AccountTypeBadge({
  role,
  creatorProfile,
}: {
  role: SessionUser["role"];
  creatorProfile: SessionUser["creatorProfile"];
}) {
  if (role === "ADMIN") {
    return <span style={accountBadgeStyle("var(--accent)")}>Admin</span>;
  }
  if (creatorProfile) {
    const statusLabel = creatorProfile.status === "VERIFIED" ? "Verified" : "Pending";
    return <span style={accountBadgeStyle("var(--accent)")}>Creator · {statusLabel}</span>;
  }
  return <span style={accountBadgeStyle("var(--accent-gold)")}>Fan</span>;
}

function accountBadgeStyle(color: string): React.CSSProperties {
  return {
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color,
    border: `1px solid ${color}`,
    borderRadius: "999px",
    padding: "0.2rem 0.6rem",
  };
}

/**
 * Country/city input built around useLocationDetector. On signup
 * (autoDetect, the default) it detects on mount, since there's no
 * existing value yet and the common path shouldn't show a blank box
 * someone has to decide what to type into. In settings (autoDetect=false)
 * it only detects when the "Detect" button is clicked — a returning
 * visitor's already-saved, already-correct location shouldn't trigger a
 * geolocation permission prompt just from opening the page. Either way
 * the fields stay editable as the fallback for denied permission or a
 * wrong reverse-geocode, with a note making clear where the value came
 * from.
 */
export function LocationField({
  country,
  city,
  onChange,
  autoDetect = true,
}: {
  country: string;
  city: string;
  onChange: (v: { country: string; city: string }) => void;
  autoDetect?: boolean;
}) {
  const { status, error, detect } = useLocationDetector();
  const [autoFilled, setAutoFilled] = useState(false);
  const triedRef = useRef(false);

  useEffect(() => {
    if (!autoDetect || triedRef.current) return;
    triedRef.current = true;
    detect().then((loc) => {
      if (loc) {
        onChange(loc);
        setAutoFilled(true);
      }
    });
    // Only ever auto-fires once per mounted field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redetect() {
    setAutoFilled(false);
    const loc = await detect();
    if (loc) {
      onChange(loc);
      setAutoFilled(true);
    }
  }

  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <span style={fieldLabelStyle}>Location</span>
        <button type="button" onClick={redetect} disabled={status === "detecting"} style={detectButtonStyle}>
          {status === "detecting" ? "Detecting..." : "Detect my location"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
        <input
          style={inputStyle}
          value={country}
          onChange={(e) => onChange({ country: e.target.value, city })}
          placeholder="Country"
          maxLength={100}
          required
        />
        <input
          style={inputStyle}
          value={city}
          onChange={(e) => onChange({ country, city: e.target.value })}
          placeholder="City"
          maxLength={100}
          required
        />
      </div>
      <span style={hintStyle}>
        {autoFilled
          ? "Detected from your device location. Edit if it's wrong."
          : error
            ? `${error} (you can still enter it manually)`
            : "We use your real location — this can't be a made-up city."}
      </span>
    </div>
  );
}

const detectButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  borderRadius: "999px",
  padding: "0.3rem 0.7rem",
  fontSize: "0.76rem",
  fontWeight: 600,
  cursor: "pointer",
};

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

const navWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
};

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "1.1rem 1.75rem",
  borderBottom: "1px solid var(--border)",
  background: "rgba(11, 11, 16, 0.72)",
  backdropFilter: "blur(10px)",
};

/** The role-mode color strip — same mechanism as the account badge (var(--accent), swapped by [data-role]), just visible on every single page, not only where the badge renders. */
const navAccentBarStyle: React.CSSProperties = {
  height: "3px",
  background: "linear-gradient(90deg, var(--accent), transparent 70%)",
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
