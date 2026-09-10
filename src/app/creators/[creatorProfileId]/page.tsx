"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { VerifiedBadge, CheckTick, displayHeadingStyle, useSession, SignInGate } from "@/components/ui";
import { ReportButton } from "@/components/cards";
import { ComposeMessageModal, PostCard, type PostCardItem } from "@/components/post-card";

interface CreatorProfileResponse {
  creatorProfileId: string;
  userId: string;
  displayName: string | null;
  handle: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  country: string | null;
  city: string | null;
  verifiedBadge: true;
  vvipPriceUsd: number;
  unlimitedParticipant: boolean;
  acceptsMessages: boolean;
  followerCount: number;
  followingCount: number;
  subscriberCount?: number;
  isFoundingPartner: boolean;
  isFoundingBaddie: boolean;
}

const TIER_ORDER = ["FREE", "VIP", "VVIP"] as const;
type Tier = (typeof TIER_ORDER)[number];

/**
 * Creator profile — header stays exactly as it was (avatar, name,
 * VerifiedBadge, bio, follower/subscriber counts, Subscribe button),
 * per the social-feed redesign brief's own instruction. Content section
 * is now a single column of full PostCard posts, matching the home
 * feed exactly (direct request: "Content should be in one column like
 * in the home feed") — replaced the earlier Instagram-style thumbnail
 * grid (GridThumbnail/PostDetailOverlay). PostCard already renders its
 * own creator byline, Follow button, and "•••" (Subscribe/Report) menu
 * per post, so those controls now appear both here at the page header
 * and again on every card below — a deliberate choice, matching how
 * Instagram/Twitter's own profile pages work, not an oversight; a
 * second, lighter card type built solely to avoid that redundancy
 * would be new surface area for a cosmetic concern. Since PostCard
 * itself doesn't need a click-to-expand affordance (unlike a grid
 * thumbnail), the earlier click-to-open overlay state is gone too — the
 * feed's own list has no equivalent to match. Still fed by this
 * creator's own cursor-paginated /content route with its own
 * infinite-scroll sentinel. The tier tab bar is unchanged in spirit —
 * still only shown once more than one tier is present, now centered —
 * filters client-side over whatever's already loaded. A Message button
 * sits next to Follow, opening the same ComposeMessageModal the feed's
 * engagement row uses, pre-targeted at this creator.
 */
export default function CreatorProfilePage() {
  const params = useParams<{ creatorProfileId: string }>();
  const creatorProfileId = params.creatorProfileId;
  const { user, loading: sessionLoading } = useSession();

  const [creator, setCreator] = useState<CreatorProfileResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  const [items, setItems] = useState<PostCardItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [gridInitialLoading, setGridInitialLoading] = useState(true);
  const [gridLoadingMore, setGridLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [gridError, setGridError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tier | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async (afterCursor: string | null) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (afterCursor) setGridLoadingMore(true);
      setGridError(null);
      try {
        const res = await fetch(
          `/api/creators/${creatorProfileId}/content${afterCursor ? `?cursor=${encodeURIComponent(afterCursor)}` : ""}`
        );
        if (!res.ok) throw new Error("Failed to load.");
        const body = await res.json();
        setItems((prev) => (afterCursor ? [...prev, ...body.items] : body.items));
        setCursor(body.nextCursor ?? null);
        setHasMore(Boolean(body.nextCursor));
      } catch {
        setGridError("Couldn't load this creator's posts. Try refreshing.");
      } finally {
        loadingRef.current = false;
        setGridInitialLoading(false);
        setGridLoadingMore(false);
      }
    },
    [creatorProfileId]
  );

  useEffect(() => {
    // Signed-out visitors are gated below (SignInGate) — don't even fetch
    // this creator's data for them.
    if (!user) return;
    let cancelled = false;

    fetch(`/api/creators/${creatorProfileId}`)
      .then((r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled && body) setCreator(body);
      });

    loadPage(null);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorProfileId, user]);

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

  if (sessionLoading) return <main style={mainStyle} />;
  if (!user) {
    return <SignInGate message="Create a free account or sign in to view this creator's profile." />;
  }

  async function toggleFollow() {
    setFollowBusy(true);
    const res = await fetch(`/api/creators/${creatorProfileId}/follow`, {
      method: following ? "DELETE" : "POST",
    });
    setFollowBusy(false);
    if (res.ok) {
      setFollowing((f) => !f);
      setCreator((c) => (c ? { ...c, followerCount: c.followerCount + (following ? -1 : 1) } : c));
    }
  }

  if (notFound) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Creator not found</h1>
        <p style={{ color: "var(--text-muted)" }}>This creator doesn&apos;t exist or isn&apos;t verified yet.</p>
      </main>
    );
  }

  if (!creator) {
    return (
      <main style={mainStyle}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </main>
    );
  }

  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const isOwnProfile = user?.creatorProfile?.id === creatorProfileId;

  const tiersPresent = TIER_ORDER.filter((t) => items.some((i) => i.accessLevel === t));
  const showTabs = tiersPresent.length > 1;
  const visibleItems = tab ? items.filter((i) => i.accessLevel === tab) : items;

  return (
    <main style={mainStyle}>
      <div style={headerStyle}>
        <div style={identityRowStyle}>
          <div style={avatarStyle}>
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            <button onClick={toggleFollow} disabled={followBusy} style={followButtonStyle(following)}>
              {following ? "Following" : "Follow"}
            </button>
            {creator.acceptsMessages && (
              <button onClick={() => setMessageOpen(true)} style={messageIconButtonStyle} aria-label="Message">
                <MessageIcon />
              </button>
            )}
          </div>
        )}
      </div>

      <h2 style={sectionHeadingStyle}>Content</h2>

      {showTabs && (
        <div style={tabRowStyle}>
          {tiersPresent.map((t) => (
            <button key={t} onClick={() => setTab((cur) => (cur === t ? undefined : t))} style={tabButtonStyle(tab === t)}>
              {t === "FREE" ? "Teasers" : t === "VIP" ? "VIP" : "Exclusive"}
            </button>
          ))}
        </div>
      )}

      {gridError && <p style={{ color: "var(--danger)" }}>{gridError}</p>}
      {gridInitialLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : visibleItems.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No content yet.</p>
      ) : (
        <div style={contentListStyle}>
          {visibleItems.map((item) => (
            <PostCard key={item.contentId} item={item} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
      {gridLoadingMore && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading more...</p>}

      {messageOpen && <ComposeMessageModal creatorProfileId={creatorProfileId} onClose={() => setMessageOpen(false)} />}
    </main>
  );
}

/**
 * Subscribe to this creator's Exclusive tier — calls the stub-backed
 * /api/checkout/subscribe route (see its own doc comment for why the
 * stub path completes synchronously instead of waiting on a payment
 * webhook). No real money moves; this is the flow real vendor
 * integration would slot into once one is selected. The platform-wide
 * VIP Pass has its own entry point (the banner on /feed) — this
 * button is Exclusive-only, per the profile page's own scope.
 */
function SubscribeButton({
  creatorProfileId,
  vvipPriceUsd,
}: {
  creatorProfileId: string;
  vvipPriceUsd: number;
}) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribeVvip() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorProfileId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Subscription failed.");
      return;
    }
    setSubscribed(true);
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.3rem" }}>
      <button onClick={subscribeVvip} disabled={busy || subscribed} style={checkoutButtonStyle(subscribed)}>
        {subscribed ? "✓ Subscribed" : busy ? "..." : `Subscribe $${vvipPriceUsd.toFixed(2)}/mo`}
      </button>
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
      {open && (
        <>
          <div style={optionsMenuBackdropStyle} onClick={() => setOpen(false)} />
          <div style={optionsMenuPanelStyle} onClick={(e) => e.stopPropagation()}>
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
          </div>
        </>
      )}
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

// Narrowed from 1100px (the old thumbnail-grid's width) to match
// /feed's own mainStyle exactly (620px) — a single column of full
// PostCard posts at the old grid width would render each post's fixed
// 4:5 media box far larger than anywhere else in the app.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "620px", margin: "0 auto" };

// Mobile layout, per direct request: avatar+handle+checkmark+"•••" row,
// then city/country, then stats (Subscribers/Followers/Following), then
// bio, then the action row (VIP Pass/Subscribe/Follow/Message) — one
// column, each section stacked, rather than the old wide flex-wrap row.
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

// Square (rounded, not a full circle) per feedback on this specific
// header — the small nav/card avatars elsewhere stay circular. Shrunk
// from 96px (the old wide-header size) to sit inline next to the
// handle/checkmark, per the new compact identity row.
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

// Icon-only, per direct request ("message (icon only)") — matches
// FollowButton's own button sizing but square/circular for a single
// glyph rather than text.
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

// Same shape as PostOptionsMenu's own styles (post-card.tsx) —
// duplicated locally since those aren't exported.
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

// Matches /feed's own feedListStyle exactly — single column of full
// PostCard posts, per direct request ("Content should be in one
// column like in the home feed").
const contentListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "2.5rem" };
