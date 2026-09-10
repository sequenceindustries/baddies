"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PostCard, type PostCardItem } from "@/components/post-card";
import { StoryAvatarRow } from "@/components/story-avatar-row";

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

      <StoryAvatarRow />

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

const feedListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "1rem" };
