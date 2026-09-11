"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { transitions } from "@/lib/motion/tokens";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { GridThumbnail, PostDetailOverlay } from "@/components/grid-thumbnail";
import type { PostCardItem } from "@/components/post-card";
import { EmptyContentState, SkeletonBlock, inputStyle } from "@/components/ui";

interface CreatorsResponse {
  creators: CreatorCardData[];
}

/**
 * Search box + Instagram-style grid, extracted from the previous
 * page.tsx (SEO Phase 4) — page.tsx (a Server Component) now fetches
 * the grid's first page server-side (getFeedPage, the same
 * viewer-null-safe function GET /api/feed?scope=discovery delegates
 * to) and passes it in as `initialItems`/`initialCursor`, so a
 * signed-out visitor or crawler sees real, unlocked post content
 * immediately instead of the previous full-page sign-in wall. Only
 * pagination beyond the first page, and the search box, still work
 * client-side — both already worked for any viewer (search has never
 * required a session either).
 */
export function DiscoveryClient({
  initialItems,
  initialCursor,
}: {
  initialItems: PostCardItem[];
  initialCursor: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [items, setItems] = useState<PostCardItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [gridLoadingMore, setGridLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(Boolean(initialCursor));
  const [gridError, setGridError] = useState<string | null>(null);
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (afterCursor: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setGridLoadingMore(true);
    setGridError(null);
    try {
      const params = new URLSearchParams({ scope: "discovery", cursor: afterCursor });
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load.");
      const body = await res.json();
      setItems((prev) => [...prev, ...body.items]);
      setCursor(body.nextCursor ?? null);
      setHasMore(Boolean(body.nextCursor));
    } catch {
      setGridError("Couldn't load more. Try refreshing.");
    } finally {
      loadingRef.current = false;
      setGridLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (results !== null) return; // don't keep loading the grid while a search is showing
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && cursor && !loadingRef.current) {
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

  return (
    <>
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

      {/* mode="wait" cross-fades between the search-results view and the
          infinite-scroll grid rather than swapping instantly — the
          concrete implementation of "when filtering, cards should
          transition smoothly, not simply disappear instantly." */}
      <AnimatePresence mode="wait">
        {results ? (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transitions.standard}>
            <CreatorCardRow title={`${results.length} result${results.length === 1 ? "" : "s"}`} creators={results} />
            {results.length === 0 && <p style={{ color: "var(--text-muted)" }}>No creators found.</p>}
          </motion.div>
        ) : (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transitions.standard}>
            {gridError && <p style={{ color: "var(--danger)" }}>{gridError}</p>}
            {items.length === 0 ? (
              <EmptyContentState message="Nothing here yet — check back once creators publish content." />
            ) : (
              <div className="discovery-grid">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.div
                      key={item.contentId}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={transitions.standard}
                    >
                      <GridThumbnail item={item} onOpen={() => setOpenContentId(item.contentId)} variant="discovery" />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
            <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden="true" />
            {gridLoadingMore && (
              <div className="discovery-grid" style={{ marginTop: "6px" }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonBlock key={i} height="0" style={{ aspectRatio: "3 / 4", borderRadius: 0 }} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openContentId && <PostDetailOverlay key="detail" contentId={openContentId} onClose={() => setOpenContentId(null)} />}
      </AnimatePresence>
    </>
  );
}

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
