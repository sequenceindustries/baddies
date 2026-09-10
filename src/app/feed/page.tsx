"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostCard, type PostCardItem } from "@/components/post-card";
import { StoryAvatarRow } from "@/components/story-avatar-row";
import { StoryComposerButton } from "@/components/story-composer-button";
import { UploadForm } from "@/components/upload-form";
import { useSession } from "@/components/ui";

/**
 * The feed — Twitter/X-style single-column, infinite-scroll vertical
 * stream (social-feed redesign; moved here from /fan-home in a later
 * follow-up once FAN, CREATOR, and ADMIN alike started landing on this
 * page by default — "fan-home" stopped being an accurate name once it
 * wasn't fan-only). Fed by GET /api/feed (cursor-paginated, narrowed to
 * creators the viewer follows/subscribes to/is suggested — see that
 * route's own comment for the full scope rules).
 */
export default function FeedPage() {
  const [items, setItems] = useState<PostCardItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vipPassActive, setVipPassActive] = useState<boolean | null>(null);
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (afterCursor: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (afterCursor) setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed${afterCursor ? `?cursor=${encodeURIComponent(afterCursor)}` : ""}`);
      if (!res.ok) throw new Error("Failed to load feed.");
      const body = await res.json();
      setItems((prev) => (afterCursor ? [...prev, ...body.items] : body.items));
      setCursor(body.nextCursor ?? null);
      setHasMore(Boolean(body.nextCursor));
    } catch {
      setError("Couldn't load your feed. Try refreshing.");
    } finally {
      loadingRef.current = false;
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(null);
    fetch("/api/fan/subscriptions")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setVipPassActive(body.vipPass?.status === "ACTIVE");
      })
      .catch(() => {
        /* not signed in as a fan, or request failed — just hide the banner */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Standard zero-dependency infinite-scroll pattern: an
  // IntersectionObserver watching a sentinel at the bottom of the
  // list, with a generous rootMargin so the next page starts loading
  // before the viewer actually reaches the true bottom.
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

  return (
    <main style={mainStyle}>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {vipPassActive === false && <VipPassBanner />}

      <div style={composerRowStyle}>
        <StoryComposerButton onPosted={() => setStoryRefreshKey((k) => k + 1)} />
        <FeedComposer />
        <DiscoverySearchButton />
      </div>

      <StoryAvatarRow refreshKey={storyRefreshKey} />

      {initialLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          Nothing here yet — once creators publish content, it&apos;ll show up here.
        </p>
      ) : (
        <div style={feedListStyle}>
          {items.map((item) => (
            <PostCard key={item.contentId} item={item} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
      {loadingMore && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading more...</p>}
    </main>
  );
}

/**
 * Promotes the platform-wide VIP Pass (see prisma/schema.prisma's
 * ContentAccessLevel comment) — one price, unlocks VIP-tier content from
 * every participating creator. Only rendered once we know the fan
 * doesn't already have an active one (vipPassActive === false, not just
 * falsy/loading).
 */
function VipPassBanner() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getVipPass() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout/vip-pass", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't get VIP pass.");
      return;
    }
    setDone(true);
  }

  return (
    <div style={bannerStyle}>
      <div>
        <div style={{ fontWeight: 600 }}>
          {done ? "✓ VIP Pass active" : "Get the platform VIP Pass"}
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
          {done
            ? "You now have VIP-tier content from every participating creator."
            : "One price unlocks VIP-tier content from every participating creator."}
        </div>
        {error && <div style={{ fontSize: "0.8rem", color: "var(--danger)", marginTop: "0.4rem" }}>{error}</div>}
      </div>
      {!done && (
        <button onClick={getVipPass} disabled={busy} style={bannerButtonStyle}>
          {busy ? "..." : "Get VIP Pass"}
        </button>
      )}
    </div>
  );
}

/**
 * A way for creators to post without leaving the feed, per direct
 * request ("create a way for creators to post while on their feed
 * page, without having to go to the dashboard") — reuses the exact
 * same UploadForm the Profile page's Content tab already has (see
 * components/upload-form.tsx), just collapsed behind a single prompt
 * row until tapped. Shown while the account is active (not REJECTED/
 * BANNED), matching Content tab's own gating on Profile.
 *
 * Deliberately does NOT try to splice the new post into the feed list
 * above, or assume a reload will show it — /api/feed's own scope rules
 * narrow the home feed to creators the viewer follows/subscribes to/is
 * suggested (see that route's comment), so a creator's own fresh post
 * often won't appear in their OWN feed at all. A confident, honest
 * "Posted" confirmation with a link to where it definitely does show
 * up (Content history) beats a silent reload that might show nothing
 * different and read as broken.
 */
function FeedComposer() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [justPosted, setJustPosted] = useState(false);

  const creatorStatus = user?.creatorProfile?.status;
  const creatorActive = Boolean(creatorStatus) && creatorStatus !== "REJECTED" && creatorStatus !== "BANNED";
  if (!creatorActive) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={composerPromptStyle} aria-label="Share something new">
        +
      </button>
    );
  }

  return (
    <div style={composerCardStyle}>
      <div style={composerHeaderStyle}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Share something new</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setJustPosted(false);
          }}
          style={composerCloseButtonStyle}
          aria-label="Close composer"
        >
          ×
        </button>
      </div>
      {justPosted ? (
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>Posted ✓</p>
          <p style={{ margin: "0.4rem 0 1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            It&apos;s live now. Your feed here only shows creators you follow/subscribe to, so a post of your own
            may not show up in this list — you&apos;ll always find it on{" "}
            <Link href="/profile?tab=content" style={{ color: "var(--accent)" }}>
              your Content history
            </Link>
            .
          </p>
          <button type="button" onClick={() => setJustPosted(false)} style={composerPostAnotherButtonStyle}>
            Post another
          </button>
        </div>
      ) : (
        <UploadForm bare onUploaded={() => setJustPosted(true)} />
      )}
    </div>
  );
}

// Sibling row for StoryComposerButton + FeedComposer + DiscoverySearchButton,
// per direct request ("put the button next to share something new" and,
// later, "search icon pops out discovery... to the right of the plus
// sign"). All three render as fixed-size icon-only circles when
// collapsed — the "+" (post) trigger is the visually dominant one
// (60px), story and discovery are equal and smaller (38px each) on
// either side of it. Centered per direct follow-up request, same
// reasoning as StoryAvatarRow's own centering just below it — left-
// alignment stranded the row against the edge once it no longer needed
// to scroll. FeedComposer alone grows into a full-width card when
// expanded (composerCardStyle, flex:1) — the row's marginBottom lives
// here rather than on the individual collapsed/expanded styles, so
// spacing before StoryAvatarRow stays consistent either way.
const composerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.8rem",
  marginBottom: "1.5rem",
};

const composerPromptStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "60px",
  height: "60px",
  borderRadius: "50%",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: "2rem",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
};

const composerCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "1.25rem",
  flex: 1,
};

/**
 * Icon-only, opens /discovery — per direct request ("search icon pops
 * out discovery content/page"), placed to the right of the "+" post
 * trigger. Same 38px sizing as StoryComposerButton so both flank the
 * larger "+" equally, matching this row's own established icon-only
 * convention rather than a new visual language.
 */
function DiscoverySearchButton() {
  const { user } = useSession();
  const creatorStatus = user?.creatorProfile?.status;
  const creatorActive = Boolean(creatorStatus) && creatorStatus !== "REJECTED" && creatorStatus !== "BANNED";
  // Same creatorActive gating as StoryComposerButton/FeedComposer — this
  // whole row is a creator's own posting toolkit, not a general nav
  // element (Nav's own "Discover" link already covers every role); a
  // lone search icon surviving for fans while its two siblings vanish
  // would read as a layout bug, not a deliberate choice.
  if (!creatorActive) return null;

  return (
    <Link href="/discovery" style={discoverySearchButtonStyle} aria-label="Discover">
      <SearchIcon />
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const discoverySearchButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--accent)",
  flexShrink: 0,
  textDecoration: "none",
};

const composerHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "1rem",
};

const composerCloseButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  fontSize: "1.3rem",
  lineHeight: 1,
  cursor: "pointer",
  padding: "0.2rem",
};

const composerPostAnotherButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};

const bannerStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--accent)",
  borderRadius: "12px",
  padding: "1.1rem 1.4rem",
  marginBottom: "1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const bannerButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  flexShrink: 0,
};

// Matches the OnlyFans-style single-creator timeline's own maxWidth
// (see cards.tsx's timelineWrapStyle) — a real Twitter-style feed reads
// as one narrow centered column, not the previous multi-section page's
// full 1100px width.
const mainStyle: React.CSSProperties = { padding: "2rem 1.25rem 4rem", maxWidth: "620px", margin: "0 auto" };

// Widened from 1rem per direct feedback ("create more space between
// posts") — with the card frame already removed (no border/background
// per the Instagram-reference redesign), this gap is the only thing
// separating one post from the next, so it needs to read clearly.
const feedListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "2.5rem" };
