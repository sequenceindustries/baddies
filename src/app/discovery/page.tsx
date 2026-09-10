"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { GridThumbnail, PostDetailOverlay } from "@/components/grid-thumbnail";
import type { PostCardItem } from "@/components/post-card";
import { displayHeadingStyle, inputStyle, useSession, SignInGate } from "@/components/ui";

interface CreatorsResponse {
  creators: CreatorCardData[];
}

/**
 * Discover — search box (unchanged: creator name/bio search stays a
 * plain result list, not a grid) plus, once no search is active, a
 * dense Instagram-style grid of posts (social-feed redesign, Phase 2;
 * restyled in a later follow-up pass — see below): replaces the old
 * "Top Baddies"/"Baddies near you" creator-row browse default. Fed by
 * the same GET /api/feed the /feed page's Twitter/X-style feed uses,
 * called here with `scope=discovery` — broad and platform-wide (unlike
 * /feed's own narrowed-to-following/subscribed/suggested scope) but
 * pre-filtered server-side to unlocked content only, so this grid is
 * purely a browse-what-you-can-open surface, never a subscribe-bait
 * wall. Cursor-paginated infinite scroll, same sentinel pattern as
 * every other feed in this app. Tapping a tile opens PostDetailOverlay
 * (a modal, not a navigation), matching how Instagram's own grid tap
 * behaves. `GridThumbnail`'s `variant="discovery"` hides the creator
 * avatar/badge byline and squares off the tile corners — a Discovery-
 * only look; the creator-profile page's own grid use of the same
 * component is unaffected. CreatorCardRow/CreatorCard (search results)
 * and /discovery/[slug] are untouched. The 4/3-column, 80%-width grid
 * itself lives in globals.css's `.discovery-grid` class — inline
 * styles can't express the responsive breakpoint.
 *
 * Signed-out visitors never see this page's real content — per product
 * decision, the landing page's own Top Baddies row is the only thing an
 * anonymous visitor gets to browse; everything else, this page
 * included, is behind SignInGate.
 */
export default function DiscoveryPage() {
  const { user, loading } = useSession();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [items, setItems] = useState<PostCardItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [gridInitialLoading, setGridInitialLoading] = useState(true);
  const [gridLoadingMore, setGridLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [gridError, setGridError] = useState<string | null>(null);
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (afterCursor: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (afterCursor) setGridLoadingMore(true);
    setGridError(null);
    try {
      // scope=discovery: broad, platform-wide (not narrowed to
      // following/subscribed/suggested the way /feed's own scope is) but
      // pre-filtered server-side to unlocked content only — see
      // GET /api/feed's own doc comment for why both live in one route.
      const params = new URLSearchParams({ scope: "discovery" });
      if (afterCursor) params.set("cursor", afterCursor);
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load.");
      const body = await res.json();
      setItems((prev) => (afterCursor ? [...prev, ...body.items] : body.items));
      setCursor(body.nextCursor ?? null);
      setHasMore(Boolean(body.nextCursor));
    } catch {
      setGridError("Couldn't load the grid. Try refreshing.");
    } finally {
      loadingRef.current = false;
      setGridInitialLoading(false);
      setGridLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (results !== null) return; // don't keep loading the grid while a search is showing
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
  }, [cursor, hasMore, loadPage, results]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setSearchError("Enter at least 2 characters.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    setSearching(false);
    if (!res.ok) {
      setSearchError("Search failed.");
      return;
    }
    const body = await res.json();
    setResults(body.creators ?? []);
  }

  if (loading) return <main style={mainStyle} />;
  if (!user) {
    return <SignInGate message="Create a free account or sign in to search and discover creators." />;
  }

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Discover</h1>

      {/* No visible submit button, per direct request — confirmed live
          that a lone text input with zero button descendants does NOT
          reliably get implicit Enter-submits from this app's actual
          browser target, so requestSubmit() on Enter explicitly drives
          the same onSubmit={handleSearch} a real submit button would
          have, rather than relying on that HTML behavior. No
          placeholder either, per direct request. */}
      <form onSubmit={handleSearch} style={searchRowStyle}>
        <input
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.form?.requestSubmit();
          }}
          disabled={searching}
        />
        {results && (
          <button type="button" onClick={() => setResults(null)} style={clearSearchButtonStyle}>
            Clear
          </button>
        )}
      </form>
      {searchError && <p style={{ color: "var(--danger)" }}>{searchError}</p>}

      {results ? (
        <>
          <CreatorCardRow title={`${results.length} result${results.length === 1 ? "" : "s"}`} creators={results} />
          {results.length === 0 && <p style={{ color: "var(--text-muted)" }}>No creators found.</p>}
        </>
      ) : (
        <>
          {gridError && <p style={{ color: "var(--danger)" }}>{gridError}</p>}
          {gridInitialLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : items.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>Nothing here yet — check back once creators publish content.</p>
          ) : (
            <div className="discovery-grid">
              {items.map((item) => (
                <GridThumbnail
                  key={item.contentId}
                  item={item}
                  onOpen={() => setOpenContentId(item.contentId)}
                  variant="discovery"
                />
              ))}
            </div>
          )}
          <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
          {gridLoadingMore && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading more...</p>}
        </>
      )}

      {openContentId && <PostDetailOverlay contentId={openContentId} onClose={() => setOpenContentId(null)} />}
    </main>
  );
}

// 1320px = 1100px * 1.2 — widened 20% per direct follow-up feedback
// ("make the discovery columns 20% larger"). The grid itself is
// max-width: 100% of this <main> (see globals.css's .discovery-grid),
// so widening the container is what actually makes each of the still-4
// (still-3 on mobile) columns 20% wider, without changing column count.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "1320px", margin: "0 auto" };

const searchRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  margin: "1.5rem 0 2.5rem",
  maxWidth: "560px",
  marginLeft: "auto",
  marginRight: "auto",
};

const clearSearchButtonStyle: React.CSSProperties = {
  padding: "0.7rem 1.1rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
  flexShrink: 0,
};

