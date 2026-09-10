"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { VerifiedBadge, CheckTick, displayHeadingStyle, useSession, SignInGate } from "@/components/ui";
import { ReportButton } from "@/components/cards";
import { GridThumbnail, PostDetailOverlay } from "@/components/grid-thumbnail";
import { ComposeMessageModal, type PostCardItem } from "@/components/post-card";

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
  followerCount: number;
  subscriberCount?: number;
  isFoundingPartner: boolean;
  isFoundingBaddie: boolean;
}

const TIER_ORDER = ["FREE", "VIP", "VVIP"] as const;
type Tier = (typeof TIER_ORDER)[number];

/**
 * Creator profile — header stays exactly as it was (avatar, name,
 * VerifiedBadge, bio, follower/subscriber counts, Subscribe button),
 * per the social-feed redesign brief's own instruction. What changed:
 * the content section below is now the Instagram-style grid
 * (GridThumbnail/PostDetailOverlay, same components Discovery's Phase 2
 * grid uses) instead of ContentTimeline's vertical list, fed by this
 * creator's own now-cursor-paginated /content route with its own
 * infinite-scroll sentinel. The tier tab bar is unchanged in spirit —
 * still only shown once more than one tier is present — but now filters
 * client-side over whatever's already loaded, rather than filtering a
 * single flat array fetched all at once. A Message button sits next to
 * Follow, opening the same ComposeMessageModal the feed's engagement
 * row uses, pre-targeted at this creator.
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
  const [openContentId, setOpenContentId] = useState<string | null>(null);
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
        <div style={avatarStyle}>
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initial
          )}
        </div>
        <div style={headerTextBlockStyle}>
          <h1 style={{ ...displayHeadingStyle, marginBottom: "0.2rem" }}>
            {creator.displayName ?? "Unnamed creator"}
          </h1>
          {creator.handle && <p style={handleStyle}>@{creator.handle}</p>}
          <VerifiedBadge isFoundingPartner={creator.isFoundingPartner} isFoundingBaddie={creator.isFoundingBaddie} />
          {(creator.city || creator.country) && (
            <p style={mutedStyle}>{[creator.city, creator.country].filter(Boolean).join(", ")}</p>
          )}
          {creator.bio && <p style={{ marginTop: "0.6rem" }}>{creator.bio}</p>}
          <div style={statsRowStyle}>
            {typeof creator.subscriberCount === "number" && (
              <span style={statItemStyle}>
                <strong>{creator.subscriberCount}</strong> Subscribers
              </span>
            )}
            <span style={statItemStyle}>
              <strong>{creator.followerCount}</strong> Followers
            </span>
            {!isOwnProfile && user && (
              <SubscribeButton creatorProfileId={creatorProfileId} vvipPriceUsd={creator.vvipPriceUsd} />
            )}
            {creator.unlimitedParticipant && (
              <span style={vipPassTickStyle}>
                <CheckTick color="var(--success)" size={14} />
                VIP Pass
              </span>
            )}
          </div>
        </div>
        {!isOwnProfile && user && (
          <div style={headerActionsStyle}>
            <div style={headerActionButtonsRowStyle}>
              <button onClick={toggleFollow} disabled={followBusy} style={followButtonStyle(following)}>
                {following ? "Following" : "Follow"}
              </button>
              <button onClick={() => setMessageOpen(true)} style={messageButtonStyle}>
                Message
              </button>
            </div>
            <div style={{ marginTop: "auto" }}>
              <ReportButton reportedUserId={creator.userId} />
            </div>
          </div>
        )}
      </div>

      <h2 style={sectionHeadingStyle}>Content</h2>

      {showTabs && (
        <div style={tabRowStyle}>
          {tiersPresent.map((t) => (
            <button key={t} onClick={() => setTab((cur) => (cur === t ? undefined : t))} style={tabButtonStyle(tab === t)}>
              {t === "FREE" ? "Free" : t === "VIP" ? "VIP" : "Exclusive"}
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
        <div style={gridStyle}>
          {visibleItems.map((item) => (
            <GridThumbnail key={item.contentId} item={item} onOpen={() => setOpenContentId(item.contentId)} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
      {gridLoadingMore && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading more...</p>}

      {openContentId && <PostDetailOverlay contentId={openContentId} onClose={() => setOpenContentId(null)} />}
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

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "1100px", margin: "0 auto" };

// Real, confirmed overflow bug: three non-wrapping flex children (the
// fixed 96px avatar, the name/bio text block, and the Follow/Message/
// Report action column) added up to more than a phone viewport's width
// on their own — avatar + gaps + the action column's own ~188px content
// alone already exceeded a 375px screen's content width before the text
// block even got a chance to shrink. flexWrap lets the action column
// drop to its own line below the avatar+name row instead of forcing
// the whole header wider than the screen.
const headerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.5rem",
  alignItems: "stretch",
  marginBottom: "2.5rem",
  paddingBottom: "2rem",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
};

// Square (rounded, not a full circle) per feedback on this specific
// header — the small nav/card avatars elsewhere stay circular.
const avatarStyle: React.CSSProperties = {
  width: "96px",
  height: "96px",
  borderRadius: "16px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: "1.6rem",
  color: "var(--accent)",
  flexShrink: 0,
  overflow: "hidden",
};

// Overrides the app-wide `main { text-align: center }` rule — this
// header reads as a left-aligned identity block (avatar, name, bio),
// not centered page copy.
const headerTextBlockStyle: React.CSSProperties = { flex: 1, minWidth: 0, textAlign: "left" };

// Follow+Message sit vertically centered in the header's height
// (justifyContent: center); Report gets marginTop: auto so it's pinned
// to the bottom regardless — a flex child's own margin: auto on the
// main axis wins over the container's justify-content for that one
// item.
const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: "0.5rem",
};

const headerActionButtonsRowStyle: React.CSSProperties = { display: "flex", gap: "0.5rem" };

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", margin: "0.2rem 0" };
const handleStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", margin: "0 0 0.6rem" };

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.1rem",
  alignItems: "center",
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  marginTop: "0.9rem",
};

const statItemStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: "0.3rem",
};

const vipPassTickStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  color: "var(--success)",
  fontWeight: 600,
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

const messageButtonStyle: React.CSSProperties = {
  padding: "0.55rem 1.1rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  flexShrink: 0,
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
};

const tabRowStyle: React.CSSProperties = { display: "flex", gap: "0.5rem", marginBottom: "1.25rem" };

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

// Same Instagram Explore convention as Discovery's grid — see that
// page's own comment on why auto-fill (not auto-fit).
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: "4px",
};
