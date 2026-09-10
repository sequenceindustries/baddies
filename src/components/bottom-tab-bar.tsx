"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./ui";

// Allowlist, not a denylist (per the redesign plan's own reasoning): any
// future marketing/pre-login page is safe by default without remembering
// to add it to an exclusion list. /creators/* is a prefix match (every
// creator profile); everything else here is an exact path.
const ALLOWED_EXACT_PATHS = new Set(["/feed", "/discovery", "/messages", "/profile"]);
const ALLOWED_PREFIXES = ["/creators/"];

function isAllowedPath(pathname: string): boolean {
  if (ALLOWED_EXACT_PATHS.has(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

const TABS = [
  { href: "/feed", label: "Home", icon: HomeIcon },
  { href: "/discovery", label: "Discover", icon: DiscoverIcon },
  { href: "/messages", label: "Messages", icon: MessagesIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

/**
 * Instagram/Twitter-style fixed bottom navigation for mobile — the
 * social-feed redesign's Phase 4. Added as a sibling of Nav in
 * src/app/layout.tsx, never replacing it: Nav stays exactly as it is
 * (the coming-soon marketing site and every pre-login page keep relying
 * on it as their only navigation). This renders nothing at all unless
 * every one of these is true: mobile width (CSS media query below, same
 * 680px breakpoint/technique as .nav-hamburger in globals.css — kept
 * mounted either way so its own useSession() call doesn't get torn down
 * and remounted every time the viewport crosses the breakpoint),
 * signed-in as a FAN specifically (a creator/admin/partner has their own
 * dashboards, not this fan-facing content surface), and the current
 * route is on the allowlist above.
 */
export function BottomTabBar() {
  const { user } = useSession();
  const pathname = usePathname();
  const visible = user?.role === "FAN" && isAllowedPath(pathname);

  // Reserves space at the bottom of the page so fixed-position content
  // never renders underneath the bar — toggled on <body> rather than
  // passed down as page-level padding, since pages here don't share one
  // wrapping layout component to thread that through. Scoped to the same
  // breakpoint in CSS, so this class is a no-op above 680px even while
  // set.
  useEffect(() => {
    document.body.classList.toggle("has-bottom-tab-bar", visible);
    return () => {
      document.body.classList.remove("has-bottom-tab-bar");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <nav className="bottom-tab-bar" aria-label="Primary">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} style={tabLinkStyle(active)}>
            <Icon />
            <span style={tabLabelStyle}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function tabLinkStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.15rem",
    color: active ? "var(--accent)" : "var(--text-muted)",
    textDecoration: "none",
    padding: "0.4rem 0",
  };
}

const tabLabelStyle: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 600 };

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5L12 4l8 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function DiscoverIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9A2.5 2.5 0 0 1 18.5 17H9l-5 4v-4H5.5A2.5 2.5 0 0 1 3 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
