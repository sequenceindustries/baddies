"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { backdropFade, fadeSlideUp, transitions } from "@/lib/motion/tokens";
import { VerifiedBadge, CheckTick, useSession, EmptyContentState, SkeletonBlock } from "@/components/ui";
import { ReportButton } from "@/components/cards";
import { ComposeMessageModal, PostCard, type PostCardItem } from "@/components/post-card";
import type { PublicCreatorProfile } from "@/lib/creator/public-profile";

const TIER_ORDER = ["FREE", "VIP", "VVIP"] as const;
type Tier = (typeof TIER_ORDER)[number];

/**
 * All of the creator profile page's interactive behavior — Follow/
 * Message/Subscribe/Block, the tier tabs, the infinite-scroll content
 * grid. Everything here is unchanged in behavior from the page this
 * was extracted from; the only real change is where `creator` comes
 * from: a server-fetched `initialCreator` prop (see page.tsx, a Server
 * Component) instead of this component fetching it itself over HTTP
 * client-side.
 *
 * `creatorProfileId` is always the real, resolved cuid — never
 * whatever URL segment the visitor typed (which may be a handle) —
 * because every nested API route this component calls
 * (.../follow, .../content, .../block, .../message,
 * /api/checkout/subscribe) only ever looks a creator up by raw id.
 *
 * This still produces full, real HTML in the server response despite
 * being a "use client" file: a Server Component parent rendering a
 * Client Component with real props already resolved (not a client-side
 * fetch) still gets that Client Component's full markup in the initial
 * server-rendered pass — the "use client" boundary only governs
 * hydration/interactivity afterward, not whether the server renders it
 * at all. That's what actually fixes the SEO problem here, not merely
 * moving files around.
 *
 * SEO Phase 4: the content grid's FIRST page now comes pre-loaded from
 * the server (`initialItems`/`initialCursor`, computed by page.tsx via
 * the same viewer-null-safe getCreatorPublicContentPage the API route
 * itself delegates to) — real, unique, crawlable caption text for
 * every visitor including a crawler, with locked items still rendering
 * only their lock/CTA state, never a media URL. Only pagination beyond
 * the first page still fetches client-side, and it now runs for every
 * visitor (signed in or not) rather than being gated on `isSignedIn` —
 * the backing route was already safe for an anonymous viewer, this
 * component just used to never be reached that way.
 */
export function CreatorProfileClient({
  creatorProfileId,
  initialCreator,
  initialItems,
  initialCursor,
}: {
  creatorProfileId: string;
  initialCreator: PublicCreatorProfile;
  initialItems: PostCardItem[];
  initialCursor: string | null;
}) {
  const { user } = useSession();

  const [creator, setCreator] = useState(initialCreator);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  const [items, setItems] = useState<PostCardItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [gridLoadingMore, setGridLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(Boolean(initialCursor));
  const [gridError, setGridError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tier | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async (afterCursor: string | null) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setGridLoadingMore(true);
      setGridError(null);
      try {
        const res = await fetch(
          `/api/creators/${creatorProfileId}/content${afterCursor ? `?cursor=${encodeURIComponent(afterCursor)}` : ""}`
        );
        if (!res.ok) throw new Error("Failed to load.");
        const body = await res.json();
        setItems((prev) => [...prev, ...body.items]);
        setCursor(body.nextCursor ?? null);
        setHasMore(Boolean(body.nextCursor));
      } catch {
        setGridError("Couldn't load more posts. Try refreshing.");
      } finally {
        loadingRef.current = false;
        setGridLoadingMore(false);
      }
    },
    [creatorProfileId]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) {
          loadPage(cursor);
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadPage]);

  async function toggleFollow() {
    setFollowBusy(true);
    const res = await fetch(`/api/creators/${creatorProfileId}/follow`, {
      method: following ? "DELETE" : "POST",
    });
    setFollowBusy(false);
    if (res.ok) {
      setFollowing((f) => !f);
      setCreator((c) => ({ ...c, followerCount: c.followerCount + (following ? -1 : 1) }));
    }
  }

  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const isOwnProfile = user?.creatorProfile?.id === creatorProfileId;

  const tiersPresent = TIER_ORDER.filter((t) => items.some((i) => i.accessLevel === t));
  const showTabs = tiersPresent.length > 1;
  const visibleItems = tab ? items.filter((i) => i.accessLevel === tab) : items;

  return (
    <>
      <div style={headerStyle}>
        <div style={identityRowStyle}>
          <div style={avatarStyle}>
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creator.avatarUrl}
                alt={`${creator.displayName ?? "Creator"} — verified creator on baddies`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              initial
            )}
          </div>
          <div style={identityTextStyle}>
            <span style={nameStyle}>{creator.displayName ?? "Unnamed creator"}</span>
            {creator.handle && <span style={handleStyle}>@{creator.handle}</span>}
            <VerifiedBadge isFoundingPartner={creator.isFoundingPartner} isFoundingBaddie={creator.isFoundingBaddie} />
          </div>
          {!isOwnProfile && user && (
            <CreatorOptionsMenu
              creatorProfileId={creatorProfileId}
              creatorUserId={creator.userId}
              onBlocked={() => setFollowing(false)}
            />
          )}
        </div>

        {(creator.city || creator.country) && (
          <p style={mutedStyle}>{[creator.city, creator.country].filter(Boolean).join(", ")}</p>
        )}

        <div style={statsRowStyle}>
          {typeof creator.subscriberCount === "number" && (
            <span style={statItemStyle}>
              <strong>{creator.subscriberCount}</strong> Subscribers
            </span>
          )}
          <span style={statItemStyle}>
            <strong>{creator.followerCount}</strong> Followers
          </span>
          <span style={statItemStyle}>
            <strong>{creator.followingCount}</strong> Following
          </span>
        </div>

        {creator.bio && <p style={bioStyle}>{truncateBio(creator.bio)}</p>}

        {!isOwnProfile && user && (
          <div style={actionRowStyle}>
            {creator.unlimitedParticipant && (
              <span style={vipPassTickStyle}>
                <CheckTick color="var(--success)" size={14} />
                VIP Pass
              </span>
            )}
            <SubscribeButton creatorProfileId={creatorProfileId} vvipPriceUsd={creator.vvipPriceUsd} />
            <motion.button
              onClick={toggleFollow}
              disabled={followBusy}
              style={followButtonStyle(following)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={transitions.micro}
            >
              {following ? "Following" : "Follow"}
            </motion.button>
            {creator.acceptsMessages && (
              <motion.button
                onClick={() => setMessageOpen(true)}
                style={messageIconButtonStyle}
                aria-label="Message"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={transitions.micro}
              >
                <MessageIcon />
              </motion.button>
            )}
          </div>
        )}
      </div>

      <h2 style={sectionHeadingStyle}>Content</h2>

      {/* SEO Phase 4: no more sign-in gate here — the first page arrives
          server-rendered (initialItems), real for every visitor. */}
      {showTabs && (
        <div style={tabRowStyle}>
          {tiersPresent.map((t) => (
            <motion.button
              key={t}
              onClick={() => setTab((cur) => (cur === t ? undefined : t))}
              style={tabButtonStyle(tab === t)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={transitions.micro}
            >
              {t === "FREE" ? "Teasers" : t === "VIP" ? "VIP" : "Exclusive"}
            </motion.button>
          ))}
        </div>
      )}

      {gridError && <p style={{ color: "var(--danger)" }}>{gridError}</p>}
      {/* Cross-fades on tab switch instead of the list instantly
          swapping — same "filtering should transition smoothly" idea
          applied here as on Discovery's own search results. */}
      <AnimatePresence mode="wait">
        {visibleItems.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transitions.standard}>
            <EmptyContentState message="No content yet." />
          </motion.div>
        ) : (
          <motion.div
            key={tab ?? "all"}
            style={contentListStyle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitions.standard}
          >
            {visibleItems.map((item) => (
              <PostCard key={item.contentId} item={item} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
      {gridLoadingMore && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
          <SkeletonBlock height="18rem" />
        </div>
      )}

      <AnimatePresence>
        {messageOpen && (
          <ComposeMessageModal key="compose" creatorProfileId={creatorProfileId} onClose={() => setMessageOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Subscribe to this creator's Exclusive tier — calls
 * /api/checkout/subscribe, which now (monetisation redesign) only
 * creates a PendingOrder and hands back a hosted-checkout redirect; no
 * Subscription/entitlement exists until the payment webhook
 * independently confirms it (see that route's own doc comment). This
 * button defaults to the platform's recommended 3-month package —
 * see /fan-subscriptions for the full 1/3/6/12-month plan picker and
 * bundle-savings comparison (Phase 7 of the monetisation plan); this
 * is the quick, single-tap path from a creator's own profile. The
 * platform-wide VIP Pass has its own entry point (the banner on
 * /feed) — this button is Exclusive-only, per the profile page's own
 * scope.
 */
const SUBSCRIBE_DEFAULT_DURATION_MONTHS = 3;

function SubscribeButton({ creatorProfileId, vvipPriceUsd }: { creatorProfileId: string; vvipPriceUsd: number }) {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribeVvip() {
    setRedirecting(true);
    setError(null);
    const res = await fetch("/api/checkout/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorProfileId, durationMonths: SUBSCRIBE_DEFAULT_DURATION_MONTHS }),
    });
    if (!res.ok) {
      setRedirecting(false);
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't start checkout.");
      return;
    }
    const body = (await res.json()) as { redirectUrl: string };
    window.location.href = body.redirectUrl;
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.3rem" }}>
      <motion.button
        onClick={subscribeVvip}
        disabled={redirecting}
        style={checkoutButtonStyle(false)}
        whileHover={redirecting ? undefined : { scale: 1.04 }}
        whileTap={redirecting ? undefined : { scale: 0.96 }}
        transition={transitions.micro}
        layout
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={redirecting ? "redirecting" : "idle"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transitions.micro}
            style={{ display: "inline-block" }}
          >
            {redirecting
              ? "···"
              : `Subscribe from $${vvipPriceUsd.toFixed(2)}/mo`}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {error && <span style={{ fontSize: "0.78rem", color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

function checkoutButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1rem",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: active ? "default" : "pointer",
    background: active ? "var(--surface-raised)" : "var(--accent)",
    color: active ? "var(--text-muted)" : "var(--bg)",
    border: active ? "1px solid var(--border)" : "none",
  };
}

// One short sentence, tops — per direct request ("bio, limit
// characters, one short sentence tops"). Display-time truncation only,
// not a new write-time limit on the settings form's own bio field
// (Profile.bio is an unconstrained String? in the schema) — this is
// specifically about how the bio renders on the profile page.
const BIO_DISPLAY_LIMIT = 100;
function truncateBio(bio: string): string {
  return bio.length > BIO_DISPLAY_LIMIT ? `${bio.slice(0, BIO_DISPLAY_LIMIT).trimEnd()}…` : bio;
}

/**
 * "•••" menu on the identity row — Share / Report / Block, per direct
 * request ("place 3 dot menu and on that menu have: share, report,
 * block... Remove report, leave it for the 3 dot menu"). Same shape as
 * PostOptionsMenu (src/components/post-card.tsx): position:relative
 * wrapper, a full-viewport invisible backdrop closing the panel on
 * outside click, an absolute panel. Not imported from post-card.tsx
 * (those styles/DotsIcon aren't exported) — duplicated locally, same
 * "small self-contained per-file helper" precedent this codebase
 * already uses elsewhere (e.g. story-composer-button.tsx's own
 * fileToBase64).
 *
 * ReportButton itself needs no changes — this is a pure relocation out
 * of the header's old action column into this menu.
 */
function CreatorOptionsMenu({
  creatorProfileId,
  creatorUserId,
  onBlocked,
}: {
  creatorProfileId: string;
  creatorUserId: string;
  onBlocked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/creators/${creatorProfileId}`;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User cancelled the native share sheet — not an error.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing more we can do without a model.
    }
  }

  async function handleBlock() {
    setBlocking(true);
    const res = await fetch(`/api/creators/${creatorProfileId}/block`, { method: "POST" });
    setBlocking(false);
    if (res.ok) {
      setBlocked(true);
      onBlocked();
    }
  }

  return (
    <div style={optionsMenuWrapStyle}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={optionsMenuButtonStyle}
        aria-label="More options"
      >
        <DotsIcon />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div key="backdrop" style={optionsMenuBackdropStyle} onClick={() => setOpen(false)} {...backdropFade} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div key="panel" style={optionsMenuPanelStyle} onClick={(e) => e.stopPropagation()} {...fadeSlideUp}>
            <button onClick={handleShare} style={optionsMenuItemStyle}>
              {shareCopied ? "Copied" : "Share"}
            </button>
            <div style={optionsMenuDividerStyle} />
            <ReportButton reportedUserId={creatorUserId} />
            <div style={optionsMenuDividerStyle} />
            {blocked ? (
              <span style={{ ...optionsMenuItemStyle, color: "var(--text-muted)", cursor: "default" }}>✓ Blocked</span>
            ) : (
              <button onClick={handleBlock} disabled={blocking} style={{ ...optionsMenuItemStyle, color: "var(--danger)" }}>
                {blocking ? "..." : "Block"}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9A2.5 2.5 0 0 1 18.5 17H9l-5 4v-4H5.5A2.5 2.5 0 0 1 3 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  marginBottom: "2.5rem",
  paddingBottom: "2rem",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
};

const identityRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
};

const avatarStyle: React.CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "12px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: "1.2rem",
  color: "var(--accent)",
  flexShrink: 0,
  overflow: "hidden",
};

const identityTextStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const nameStyle: React.CSSProperties = { fontWeight: 600, fontSize: "1.1rem" };

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 };
const handleStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem" };

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.1rem",
  alignItems: "center",
  fontSize: "0.85rem",
  color: "var(--text-muted)",
};

const statItemStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: "0.3rem",
};

const bioStyle: React.CSSProperties = { margin: 0, fontSize: "0.92rem" };

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.6rem",
};

const vipPassTickStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  color: "var(--success)",
  fontWeight: 600,
  fontSize: "0.85rem",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1rem",
};

function followButtonStyle(following: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1.1rem",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    flexShrink: 0,
    background: following ? "transparent" : "var(--accent)",
    color: following ? "var(--text)" : "var(--bg)",
    border: following ? "1px solid var(--border)" : "none",
  };
}

const messageIconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  cursor: "pointer",
  flexShrink: 0,
};

const optionsMenuWrapStyle: React.CSSProperties = { position: "relative", flexShrink: 0 };

const optionsMenuButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text)",
  cursor: "pointer",
  padding: "0.2rem",
  display: "flex",
  alignItems: "center",
};

const optionsMenuBackdropStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 9 };

const optionsMenuPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  zIndex: 10,
  marginTop: "0.3rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "0.75rem",
  minWidth: "180px",
  boxShadow: "var(--glow)",
  textAlign: "left",
};

const optionsMenuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "0.4rem 0",
  fontSize: "0.85rem",
  color: "var(--text)",
  cursor: "pointer",
};

const optionsMenuDividerStyle: React.CSSProperties = { borderTop: "1px solid var(--border)", margin: "0.4rem 0" };

const tabRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "0.5rem",
  marginBottom: "1.25rem",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.4rem 0.9rem",
    borderRadius: "999px",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent)" : "var(--surface-raised)",
    color: active ? "var(--bg)" : "var(--text)",
    border: active ? "none" : "1px solid var(--border)",
  };
}

const contentListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "2.5rem" };
