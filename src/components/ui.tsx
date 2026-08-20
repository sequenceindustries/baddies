"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

/**
 * Fetches /api/auth/me on mount and again on every client-side route
 * change. The route-change refetch matters for Nav specifically: Nav
 * lives in the root layout, so it mounts once for the whole session
 * rather than per-page — without this, logging in (a client-side
 * router.push to /fan-home or /creator-dashboard, not a full page load)
 * left Nav's
 * own useSession() instance holding onto its original signed-out `user:
 * null` from before login, showing "Sign in"/"Join" to someone who very
 * much was signed in, until a hard refresh remounted it. Every other
 * page's own useSession() call was unaffected (those components remount
 * per navigation anyway), but there was no signal telling Nav's
 * long-lived instance to look again.
 */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined); // undefined = loading
  const [reloadKey, setReloadKey] = useState(0);
  const pathname = usePathname();

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
  }, [reloadKey, pathname]);

  const refresh = () => setReloadKey((k) => k + 1);
  return { user, loading: user === undefined, refresh };
}

/**
 * Where a signed-in visitor's "home" is — used right after login/
 * register, and by the landing page's already-signed-in redirect. Every
 * one of these URLs names its own account type (/fan-home,
 * /creator-dashboard) rather than a generic path like the old /home,
 * /dashboard — so a URL alone always says which kind of account it's
 * for, with no need to already be signed in as that type to know.
 */
export function roleHomePath(role: SessionUser["role"]): string {
  if (role === "ADMIN") return "/admin";
  if (role === "CREATOR") return "/creator-dashboard";
  return "/fan-home";
}

export function Nav() {
  const { user, loading, refresh } = useSession();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    refresh();
    window.location.href = "/";
  }

  return (
    <div style={navWrapStyle}>
    <nav style={navStyle}>
      <Link href="/" style={{ ...brandStyle, textDecoration: "none" }}>
        baddies
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
              <Link href="/creator-dashboard" style={linkStyle}>
                Dashboard
              </Link>
            )}
            {user.role === "FAN" && (
              <>
                <Link href="/fan-home" style={linkStyle}>
                  Home
                </Link>
                <Link href="/fan-subscriptions" style={linkStyle}>
                  My subscriptions
                </Link>
              </>
            )}
            {user.role !== "ADMIN" && (
              <>
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
            {user.creatorProfile?.status === "VERIFIED" && <VerifiedBadge />}
            <AccountMenu user={user} onLogout={handleLogout} />
          </>
        ) : (
          // No "Discover" link here — Discover, creator profiles, and
          // search are all gated behind sign-in (see SignInGate's
          // comment), so linking to them for a signed-out visitor would
          // just be a dead end. The landing page's own Top Baddies row
          // is the one thing they get to browse first.
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
    <div style={navAccentBarStyle} aria-hidden="true" />
    </div>
  );
}

/**
 * Consolidates what used to be three separate things loose in the nav
 * row (a plain "Settings" link, a bare name/email span, and the account-
 * type pill) into one top-right control: click the name to open a small
 * panel with the identity summary, the Settings link, and Sign out — the
 * "Account" surface for anyone who isn't a creator using the Dashboard's
 * own Account tab. Closes on an outside click or Escape.
 */
function AccountMenu({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={accountMenuTriggerStyle} aria-expanded={open}>
        {user.displayName ?? user.email}
        <span style={{ fontSize: "0.65rem" }}>▾</span>
      </button>
      {open && (
        <div style={accountMenuPanelStyle}>
          <div style={{ padding: "0.2rem 0.2rem 0.7rem" }}>
            <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{user.displayName ?? "Unnamed"}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>{user.email}</div>
            <div style={{ marginTop: "0.5rem" }}>
              <AccountTypeBadge role={user.role} creatorProfile={user.creatorProfile} />
            </div>
          </div>
          <Link href="/settings" style={accountMenuLinkStyle} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button onClick={onLogout} style={accountMenuButtonStyle}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Deliberately --success (green), not --accent — this is the one badge
// in the app that means "account type," not "brand color," so it stays
// visually distinct from every blue button/border/glow elsewhere. Paired
// with AccountTypeBadge's Fan color (--accent, blue) below, that's the
// "two different colours" account-type indicator in the nav's top right.
export function VerifiedBadge() {
  return (
    <span style={{ ...badgeStyle, color: "var(--success)" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="var(--success)" />
        <path
          d="M9 12.5l2 2 4.5-5"
          stroke="var(--bg)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      baddie
    </span>
  );
}

/**
 * Always-visible account-type pill — the whole point is that a signed-in
 * person should never have to guess whether they're looking at a fan
 * account or a creator account. Creator gets its onboarding status
 * appended (e.g. "Creator · Pending") since "Creator" alone doesn't say
 * whether they can actually publish/monetise yet. Verified creators get
 * the standalone VerifiedBadge (green) in the nav instead of this pill —
 * see Nav — so the only colors this one actually renders are blue (Fan/
 * Admin/general) and muted gray (still-pending creator).
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
    const verified = creatorProfile.status === "VERIFIED";
    const statusLabel = verified ? "Verified" : "Pending";
    return (
      <span style={accountBadgeStyle(verified ? "var(--success)" : "var(--text-muted)")}>
        Creator · {statusLabel}
      </span>
    );
  }
  return <span style={accountBadgeStyle("var(--accent)")}>Fan</span>;
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

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — these fields are all plain data: URI strings (Profile.avatarUrl, CreatorProfile.coverImageUrl), no upload endpoint needed, so this keeps the row reasonable.

/**
 * A file picker that reads the chosen image straight to a data: URI
 * client-side, no upload endpoint needed — the target fields
 * (Profile.avatarUrl, CreatorProfile.coverImageUrl) are already just
 * plain strings. Shared by every place a creator sets a profile picture
 * or featured image: /settings, /apply (at signup), and the Dashboard's
 * Content tab (see ImageUploadField's callers).
 */
export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  shape = "circle",
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  shape?: "circle" | "rect";
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large — please pick one under 2MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    onChange(dataUrl);
  }

  return (
    <Field label={label} hint={hint ?? "JPG, PNG, or WebP, up to 2MB."} error={error ?? undefined}>
      <div style={imageUploadRowStyle}>
        <div style={shape === "circle" ? imageUploadPreviewCircleStyle : imageUploadPreviewRectStyle}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "+"
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={uploadButtonStyle}>
            Upload photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
          {value && (
            <button type="button" onClick={() => onChange(null)} style={removeImageButtonStyle}>
              Remove
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

const imageUploadRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  marginTop: "0.4rem",
};

const imageUploadPreviewCircleStyle: React.CSSProperties = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "2px solid var(--accent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--accent)",
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  fontSize: "1.3rem",
  overflow: "hidden",
  flexShrink: 0,
};

// Wider than tall — a featured image is a card thumbnail (4:5-ish once
// cropped into CreatorCard), not an avatar, so the preview shape hints
// at that instead of implying a face-crop like the circle does.
const imageUploadPreviewRectStyle: React.CSSProperties = {
  ...imageUploadPreviewCircleStyle,
  width: "84px",
  height: "64px",
  borderRadius: "10px",
};

const uploadButtonStyle: React.CSSProperties = {
  display: "inline-block",
  background: "var(--accent)",
  color: "var(--bg)",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  textAlign: "center",
};

const removeImageButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  borderRadius: "var(--radius)",
  padding: "0.45rem 1rem",
  fontSize: "0.82rem",
  cursor: "pointer",
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
  background: "var(--accent)",
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

/**
 * The wall a signed-out visitor hits on any page that isn't the landing
 * page's own Top Baddies row — Discover, a creator's profile, category
 * browsing. Per product decision, anonymous visitors see nothing of the
 * platform except that one row before joining, so every other browsing
 * surface renders this instead of its real content once loading is
 * known to be done and there's no user (see each caller's own
 * `!loading && !user` check).
 */
export function SignInGate({
  heading,
  message,
  loginHref = "/login",
  showJoin = true,
}: {
  heading?: string;
  message?: string;
  loginHref?: string;
  showJoin?: boolean;
}) {
  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>{heading ?? "Join to keep browsing"}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        {message ?? "Create a free account or sign in to browse creators and their content."}
      </p>
      <div style={signInGateCtaRowStyle}>
        {showJoin && (
          <Link href="/register" style={signInGatePrimaryStyle}>
            Join free
          </Link>
        )}
        <Link href={loginHref} style={showJoin ? signInGateSecondaryStyle : signInGatePrimaryStyle}>
          Sign in
        </Link>
      </div>
    </main>
  );
}

const signInGateCtaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const signInGatePrimaryStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "999px",
  padding: "0.8rem 1.75rem",
  fontWeight: 700,
  fontSize: "0.92rem",
  textDecoration: "none",
  display: "inline-block",
};

const signInGateSecondaryStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.8rem 1.75rem",
  fontWeight: 700,
  fontSize: "0.92rem",
  textDecoration: "none",
  display: "inline-block",
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

/** Thin brand-accent strip under the nav, visible on every page. */
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
  color: "var(--accent)",
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

const accountMenuTriggerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "999px",
  padding: "0.4rem 0.9rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const accountMenuPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 0.5rem)",
  right: 0,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  boxShadow: "var(--glow)",
  padding: "0.75rem",
  minWidth: "200px",
  display: "flex",
  flexDirection: "column",
  zIndex: 50,
};

const accountMenuLinkStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text)",
  textDecoration: "none",
  fontSize: "0.88rem",
  padding: "0.55rem 0.2rem",
  borderTop: "1px solid var(--border)",
};

const accountMenuButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  borderTop: "1px solid var(--border)",
  color: "var(--danger)",
  fontSize: "0.88rem",
  padding: "0.55rem 0.2rem",
  cursor: "pointer",
};

// text-shadow is a no-op on the flat backgrounds this also renders
// against (e.g. the creator-profile header) — it only matters where
// VerifiedBadge sits in a content/creator card's photo overlay.
const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--accent)",
  letterSpacing: "0.02em",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
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
