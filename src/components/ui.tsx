"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface SessionUser {
  id: string;
  email: string;
  role: "FAN" | "CREATOR" | "ADMIN" | "PARTNER";
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
  creatorProfile: { id: string; status: string; isFoundingBaddie: boolean } | null;
  // Independent of role, same reason creatorProfile is: an account can
  // hold both a FoundingPartner row and (once applied) a CreatorProfile
  // at once, since applying as a creator flips role to CREATOR the same
  // way it does for a plain FAN — see /api/partner/dashboard's comment.
  foundingPartner: { id: string; status: string } | null;
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
 * browser too), but there is deliberately no typed-in fallback either —
 * see LocationField below, which has no text input at all: a denied/
 * failed detection just leaves country/city unset rather than inviting
 * a fabrication.
 */
export function useLocationDetector() {
  const [status, setStatus] = useState<"idle" | "detecting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function detect(): Promise<DetectedLocation | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("error");
        setError("Location isn't available in this browser.");
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
            setError("Couldn't determine your location.");
            resolve(null);
          }
        },
        () => {
          setStatus("error");
          setError("Location permission denied.");
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
 * router.push to /feed or /profile, not a full page load) left Nav's
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
 * register, and by the landing page's already-signed-in redirect.
 *
 * Per direct follow-up request ("for all, landing page should be
 * feed"), the feed (/feed — renamed from /fan-home once it stopped
 * being fan-only, see /app/feed/page.tsx's own comment) is now the
 * default landing page for
 * FAN, CREATOR, and ADMIN alike — their own dashboard/admin panel is
 * still reachable (Dashboard/Admin nav links, both unchanged), just no
 * longer where they land automatically. PARTNER keeps its own
 * dashboard as the default — it was never part of this feed-access
 * request (no Home/Discover nav link either, see NavLinks' own
 * comment), and a partner's referral/commission dashboard is
 * business-critical in a way a content feed landing page would bury.
 */
export function roleHomePath(role: SessionUser["role"]): string {
  if (role === "PARTNER") return "/partner-dashboard";
  return "/feed";
}

const NO_AUTH_LINKS_PATHS = new Set(["/", "/founding-baddies"]);

export function Nav({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user, loading, refresh } = useSession();
  const pathname = usePathname();
  // Both the landing page and the Founding Baddies campaign page keep
  // only their own single "Apply"/"Apply now" CTA — no Sign in/Join
  // here either, or a signed-out visitor would have a second way in
  // past that one deliberate button.
  const hideAuthLinks = NO_AUTH_LINKS_PATHS.has(pathname);
  // The landing page specifically (not /founding-baddies, which keeps
  // its single "Apply now" CTA untouched) gets a "Log in" link back,
  // per direct request ("add login on home page, top right") — a
  // narrow, deliberate exception to hideAuthLinks' "one CTA only" rule
  // above: still no "Join" here, just the one way back in for a
  // returning visitor.
  const showLoginLink = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close on route change — a link tap should never leave the dropdown
  // hanging open over the next page.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    refresh();
    window.location.href = "/";
  }

  // Nothing to show at all (signed out, on a hideAuthLinks page with no
  // login-link exception) — no point rendering a hamburger for an empty
  // dropdown.
  const hasNavContent = !(hideAuthLinks && !user) || showLoginLink;

  return (
    <div style={navWrapStyle}>
    <nav style={navStyle}>
      <Link href="/" style={{ ...brandStyle, textDecoration: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/baddies-wordmark-white.webp" alt="baddies" style={brandLogoStyle} />
      </Link>

      <div className="nav-links-desktop" style={navDesktopLinksStyle}>
        {!loading && (
          <NavLinks
            user={user ?? null}
            hideAuthLinks={hideAuthLinks}
            showLoginLink={showLoginLink}
            comingSoon={comingSoon}
            onLogout={handleLogout}
            layout="row"
          />
        )}
      </div>

      {!loading && hasNavContent && (
        <button
          type="button"
          className="nav-hamburger"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          style={hamburgerButtonStyle}
        >
          <MenuIcon open={mobileOpen} />
        </button>
      )}
    </nav>
    <div style={navAccentBarStyle} aria-hidden="true" />
    {mobileOpen && (
      <div ref={mobileMenuRef} className="nav-mobile-menu" style={mobileMenuStyle}>
        <NavLinks
          user={user ?? null}
          hideAuthLinks={hideAuthLinks}
          showLoginLink={showLoginLink}
          comingSoon={comingSoon}
          onLogout={handleLogout}
          layout="column"
        />
      </div>
    )}
    </div>
  );
}

/**
 * The actual link set for a given auth state, shared verbatim between
 * the desktop row and the mobile dropdown (layout only changes how the
 * signed-in account controls render — AccountMenu's floating popover
 * doesn't make sense nested inside a dropdown that's already floating,
 * so the mobile column gets the same identity/Settings/Sign out content
 * laid out flat instead).
 */
function NavLinks({
  user,
  hideAuthLinks,
  showLoginLink,
  comingSoon,
  onLogout,
  layout,
}: {
  user: SessionUser | null;
  hideAuthLinks: boolean;
  showLoginLink: boolean;
  comingSoon: boolean;
  onLogout: () => void;
  layout: "row" | "column";
}) {
  if (user) {
    return (
      <>
        {/* Deliberately different link sets per role (not one big list
            with items hidden) — a creator lands on tools for running
            their page, a fan lands on tools for browsing/paying, per
            "creators shouldn't see what fans see." A creator's own
            dashboard (Overview/Content/Settings) no longer has its own
            nav link or route at all — it was merged into /profile as
            additional tabs (social-feed follow-up: "remove dashboard
            from menu and merge with profile"); /profile is already
            reachable from AccountMenu for every signed-in role, so no
            replacement link was needed here. Partner Dashboard still
            keys off foundingPartner's own existence, not role — a
            Founding Partner who's also applied as a creator gets both
            that link and Profile's own creator tabs at once, since
            applying flips role to CREATOR the same way it does for a
            plain FAN (see /api/partner/dashboard's comment).

            Home/Discover (the fan-facing feed + grid) are additionally
            surfaced to CREATOR and ADMIN too, per explicit follow-up
            request — and per a later follow-up ("for all, landing page
            should be feed"), the feed is now everyone's actual default
            landing page too (roleHomePath, below), not just a
            reachable-via-nav extra. Only FAN gets "My subscriptions" —
            that's a fan-specific concern, not part of this feed-access
            widening. PARTNER now gets Home/Discover too, per direct
            follow-up ("partner dashboard page doesn't have feed") —
            a partner had no nav link to the feed at all despite
            Home/Discover already being everyone else's default; their
            own dashboard stays the actual landing page (roleHomePath
            below is untouched), this just makes the feed reachable.
            Partner Dashboard itself moved from leading the list to
            trailing it, after "Become a creator", per direct follow-up
            ("rearrange this: Home / Discover / Become a creator /
            Partner Dashboard") — everyone's shared links (Home,
            Discover, the creator-application CTA) now read first, with
            a partner's own business-specific tool last rather than
            pushed in front of them. */}
        {user.role === "ADMIN" && (
          <Link href="/admin" style={linkStyle}>
            Admin
          </Link>
        )}
        <Link href="/feed" style={linkStyle}>
          Home
        </Link>
        {user.role === "FAN" && (
          <Link href="/fan-subscriptions" style={linkStyle}>
            My subscriptions
          </Link>
        )}
        <Link href="/discovery" style={linkStyle}>
          Discover
        </Link>
        {(user.role === "FAN" || user.role === "PARTNER") && !user.creatorProfile && (
          <Link href="/apply" style={primaryLinkStyle}>
            Become a creator
          </Link>
        )}
        {user.foundingPartner && (
          <Link href="/partner-dashboard" style={linkStyle}>
            Partner Dashboard
          </Link>
        )}
        {user.creatorProfile?.status === "VERIFIED" && (
          <VerifiedBadge isFoundingPartner={Boolean(user.foundingPartner)} isFoundingBaddie={user.creatorProfile.isFoundingBaddie} />
        )}
        {layout === "row" ? (
          <AccountMenu user={user} onLogout={onLogout} />
        ) : (
          <MobileAccountBlock user={user} onLogout={onLogout} />
        )}
      </>
    );
  }

  // No "Discover" link here — Discover, creator profiles, and search are
  // all gated behind sign-in (see SignInGate's comment), so linking to
  // them for a signed-out visitor would just be a dead end. The landing
  // page's own Top Baddies row is the one thing they get to browse first.
  // The landing page itself is the one deliberate exception (see Nav's
  // own showLoginLink comment) — a returning visitor still gets a way
  // back in, just "Log in" alone, not the Join/Founding-Baddie CTA.
  if (hideAuthLinks) {
    return showLoginLink ? (
      <Link href="/login" style={linkStyle}>
        Log in
      </Link>
    ) : null;
  }

  return (
    <>
      <Link href="/login" style={linkStyle}>
        Sign in
      </Link>
      {comingSoon ? (
        // /register is fully gated by middleware while LAUNCH_MODE is
        // coming_soon (see src/middleware.ts) — a "Join" link here would
        // be clickable and look live but silently bounce back to "/".
        // Founding Baddies is the one fan/creator-facing path that
        // actually works right now, so that's the CTA new visitors get
        // instead.
        <Link href="/founding-baddies" style={primaryLinkStyle}>
          Become a Founding Baddie
        </Link>
      ) : (
        <Link href="/register" style={primaryLinkStyle}>
          Join
        </Link>
      )}
    </>
  );
}

/** Mobile-dropdown equivalent of AccountMenu's popover — same identity/
 * Settings/Sign out content, laid out inline instead of behind a second,
 * nested floating panel. */
function MobileAccountBlock({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  return (
    <div style={mobileAccountBlockStyle}>
      <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{user.displayName ?? user.email}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>{user.email}</div>
      <div style={{ marginTop: "0.5rem" }}>
        <AccountTypeBadge role={user.role} creatorProfile={user.creatorProfile} foundingPartner={user.foundingPartner} />
      </div>
      <Link href="/profile" style={accountMenuLinkStyle}>
        Profile
      </Link>
      <Link href="/settings" style={accountMenuLinkStyle}>
        Settings
      </Link>
      {user.creatorProfile && <WalletMenuLink />}
      <button onClick={onLogout} style={accountMenuButtonStyle}>
        Sign out
      </button>
    </div>
  );
}

/**
 * "Wallet ($available)" — moved here from a card on the Creator
 * Dashboard's Overview tab, per explicit product decision: it's an
 * account-level thing (like Settings), not a dashboard widget, so it
 * lives in the same menu Settings does and links to its own page
 * (src/app/wallet/page.tsx). Only rendered for creators (see both call
 * sites) — a plain fan's wallet is always $0, nothing to check.
 */
function WalletMenuLink({ onNavigate }: { onNavigate?: () => void }) {
  const [availableUsd, setAvailableUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setAvailableUsd(Number(body.availableBalanceUsd));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link href="/wallet" style={accountMenuLinkStyle} onClick={onNavigate}>
      Wallet{availableUsd !== null ? ` ($${availableUsd.toFixed(2)})` : ""}
    </Link>
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
              <AccountTypeBadge role={user.role} creatorProfile={user.creatorProfile} foundingPartner={user.foundingPartner} />
            </div>
          </div>
          <Link href="/profile" style={accountMenuLinkStyle} onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link href="/settings" style={accountMenuLinkStyle} onClick={() => setOpen(false)}>
            Settings
          </Link>
          {user.creatorProfile && <WalletMenuLink onNavigate={() => setOpen(false)} />}
          <button onClick={onLogout} style={accountMenuButtonStyle}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Three real, distinct creator standings, not a decorative palette —
// each one traces to real data (FoundingPartner row / CreatorProfile.
// isFoundingBaddie / plain VERIFIED status), never a guess. Per direct
// follow-up request, the badge itself dropped its text label entirely
// (just the tick now — label kept here only as an aria-label/title for
// accessibility, never rendered) and its colors were reassigned: gold
// for a Founding Partner (unchanged), blue for a Founding baddie
// (unchanged — "remain the blue tick"), pink for every other verified
// creator (was green — "normal creators will use a pink tick").
const CREATOR_BADGE_KIND = {
  partner: { label: "Founding Partner", color: "#d4af37" },
  founding: { label: "Founding baddie", color: "var(--accent)" },
  baddie: { label: "Verified baddie", color: "var(--accent-wine)" },
} as const;

export function CheckTick({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={color} />
      <path d="M9 12.5l2 2 4.5-5" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * isFoundingPartner takes priority over isFoundingBaddie when a creator
 * somehow holds both (the same dual-role shape FoundingPartner/
 * CreatorProfile already allow elsewhere in this app) — a real Founding
 * Partner badge is the more specific, more significant fact. Neither
 * flag set falls back to the plain "Verified baddie" badge every
 * verified creator had before this distinction existed. Renders as a
 * bare colored tick now, no text label — the label still exists as this
 * span's title/aria-label so the distinction stays available on hover
 * and to screen readers, just not always-visible text.
 */
export function VerifiedBadge({
  isFoundingPartner = false,
  isFoundingBaddie = false,
}: {
  isFoundingPartner?: boolean;
  isFoundingBaddie?: boolean;
}) {
  const kind = isFoundingPartner ? CREATOR_BADGE_KIND.partner : isFoundingBaddie ? CREATOR_BADGE_KIND.founding : CREATOR_BADGE_KIND.baddie;
  return (
    <span style={badgeStyle} title={kind.label} aria-label={kind.label}>
      <CheckTick color={kind.color} />
    </span>
  );
}

/**
 * Always-visible account-type pill — the whole point is that a signed-in
 * person should never have to guess whether they're looking at a fan
 * account or a creator account. Creator gets its onboarding status
 * appended (e.g. "Creator · Pending") since "Creator" alone doesn't say
 * whether they can actually publish/monetise yet. Verified creators get
 * the standalone VerifiedBadge (a colored tick — gold/blue/pink, see its
 * own comment) in the nav instead of this pill — see Nav — so the only
 * colors this one actually renders are blue (Fan/
 * Admin/general) and muted gray (still-pending creator).
 */
function AccountTypeBadge({
  role,
  creatorProfile,
  foundingPartner,
}: {
  role: SessionUser["role"];
  creatorProfile: SessionUser["creatorProfile"];
  foundingPartner: SessionUser["foundingPartner"];
}) {
  if (role === "ADMIN") {
    return <span style={accountBadgeStyle("var(--accent)")}>Admin</span>;
  }

  // foundingPartner and creatorProfile are independent (see SessionUser's
  // own comment) — an account can hold both at once, and gets both
  // badges at once rather than one hiding the other.
  const badges: React.ReactNode[] = [];
  if (foundingPartner) {
    badges.push(
      <span key="partner" style={accountBadgeStyle("var(--accent)")}>
        Founding Partner
      </span>
    );
  }
  if (creatorProfile) {
    const verified = creatorProfile.status === "VERIFIED";
    badges.push(
      <span key="creator" style={accountBadgeStyle(verified ? "var(--success)" : "var(--text-muted)")}>
        Creator · {verified ? "Verified" : "Pending"}
      </span>
    );
  }
  if (badges.length > 0) {
    return <span style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap" }}>{badges}</span>;
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
 * Country/city display built around useLocationDetector — no text input
 * at all, by explicit product decision: location is either the real,
 * detected value or it's unset, never something typed in. On signup
 * (autoDetect, the default) it detects on mount, since there's no
 * existing value yet and the common path shouldn't need an extra click.
 * In settings (autoDetect=false) it only detects when "Detect my
 * location" is clicked — a returning visitor's already-saved location
 * shouldn't trigger a geolocation permission prompt just from opening
 * the page. If detection is denied or fails, the field simply stays
 * unset (country/city are optional downstream — see each caller) rather
 * than falling back to a manual box; the error is shown so it's clear
 * why nothing filled in, with a way to retry.
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
  const triedRef = useRef(false);

  useEffect(() => {
    if (!autoDetect || triedRef.current) return;
    triedRef.current = true;
    detect().then((loc) => {
      if (loc) onChange(loc);
    });
    // Only ever auto-fires once per mounted field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redetect() {
    const loc = await detect();
    if (loc) onChange(loc);
  }

  const hasLocation = Boolean(country || city);

  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <span style={fieldLabelStyle}>Location</span>
        <button type="button" onClick={redetect} disabled={status === "detecting"} style={detectButtonStyle}>
          {status === "detecting" ? "Detecting..." : hasLocation ? "Detect again" : "Detect my location"}
        </button>
      </div>
      <div style={locationDisplayStyle}>
        {hasLocation ? [city, country].filter(Boolean).join(", ") : "Not set — location is detected automatically, never typed in."}
      </div>
      <span style={hintStyle}>
        {error
          ? `${error} Location stays unset until detection succeeds — try again above.`
          : "We use your real, detected location — it's never a typed-in value."}
      </span>
    </div>
  );
}

const locationDisplayStyle: React.CSSProperties = {
  padding: "0.7rem 0.8rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: "0.92rem",
};

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

/**
 * "Continue with Google" — renders nothing at all until
 * GET /api/auth/google/status confirms the server actually has Google
 * credentials configured (see src/lib/auth/google.ts), so this never
 * shows a button that would just 404 when clicked. A plain link, not a
 * fetch-triggered action — /api/auth/google/start is a real page
 * navigation (redirects on to Google's own consent screen).
 * `returnTo` (e.g. the page that required sign-in) is passed straight
 * through as a query param; the start route only ever accepts an
 * on-site path for it.
 */
export function GoogleSignInButton({ returnTo, label = "Continue with Google" }: { returnTo?: string; label?: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/google/status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((body) => {
        if (!cancelled) setEnabled(Boolean(body.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const href = `/api/auth/google/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <a href={href} style={googleButtonStyle}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
        />
        <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z" />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
        />
      </svg>
      {label}
    </a>
  );
}

const googleButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.6rem",
  width: "100%",
  padding: "0.7rem 1rem",
  background: "#fff",
  color: "#1f1f1f",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.9rem",
  textDecoration: "none",
  boxSizing: "border-box",
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

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — the cap on the ORIGINAL file picked; downscaleImage below shrinks it further before it ever leaves the browser.

// Real, confirmed perf fix: a phone photo picked here for an avatar/
// cover image was previously sent (and stored) at its full original
// resolution — one production avatar decoded to ~191KB for something
// rendered as a ~60px circle. Drawn down to this longest-edge cap via
// canvas before it's ever turned into a data: URL, which is what
// actually leaves the browser — full detail is wasted on a profile
// photo at any real display size, retina included.
const AVATAR_MAX_DIMENSION = 800;

/**
 * Reads a file to a data: URL, downscaling it through a canvas first if
 * it's larger than AVATAR_MAX_DIMENSION on its longest edge — an
 * already-small image (or a browser without canvas support) is returned
 * as-is rather than needlessly re-encoding a lossless format.
 */
async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  }).catch(() => null);
  if (!img) return dataUrl;

  const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale >= 1) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(file.type || "image/jpeg", 0.85);
}

/**
 * A file picker that reads the chosen image to a data: URI client-side
 * — the server persists that to real storage and swaps it for a long-
 * lived URL before saving (see src/lib/media/persist-public-image.ts),
 * never the raw bytes themselves. Shared by every place a creator sets
 * a profile picture or featured image: /settings, /apply (at signup),
 * and the Dashboard's Content tab (see ImageUploadField's callers).
 */
export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  shape = "circle",
  centered = false,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  shape?: "circle" | "rect";
  // Centers the preview + upload button row instead of the default
  // left alignment — opt-in so avatar/featured-image pickers elsewhere
  // keep their existing layout; only the verification flow's ID-document
  // upload asks for this today.
  centered?: boolean;
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
    const dataUrl = await downscaleImage(file);
    onChange(dataUrl);
  }

  return (
    <Field label={label} hint={hint ?? "JPG, PNG, or WebP, up to 2MB."} error={error ?? undefined}>
      <div style={centered ? { ...imageUploadRowStyle, justifyContent: "center" } : imageUploadRowStyle}>
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

/** Hamburger/X glyph — two fixed SVGs rather than an animated morph,
 * matching this file's plain-and-legible style over decorative motion. */
function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const navWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
};

const navDesktopLinksStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.25rem",
  alignItems: "center",
};

// No `display` set here on purpose — visibility is owned entirely by the
// .nav-hamburger CSS class (globals.css), which only shows it under the
// mobile breakpoint. An inline `display` here would out-rank that
// class's base (non-!important) "display: none" and show the button at
// every width.
const hamburgerButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text)",
  cursor: "pointer",
  padding: "0.3rem",
  alignItems: "center",
  justifyContent: "center",
};

const mobileMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "var(--surface)",
  borderBottom: "1px solid var(--border)",
  boxShadow: "var(--glow)",
  padding: "1rem 1.75rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
  zIndex: 25,
};

const mobileAccountBlockStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: "0.9rem",
  marginTop: "0.2rem",
  display: "flex",
  flexDirection: "column",
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

// The white wordmark file — nav's background is dark in both themes
// (rgba(11, 11, 16, ...) in navStyle), so there's no light variant to
// switch to here the way the black wordmark would need one.
const brandLogoStyle: React.CSSProperties = {
  height: "1.4rem",
  width: "auto",
  display: "block",
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
