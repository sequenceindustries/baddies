"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { displayHeadingStyle, inputStyle } from "@/components/ui";

interface CategoryItem {
  id: string;
  slug: string;
  name: string;
  creatorCount: number;
}

interface CreatorsResponse {
  creators: CreatorCardData[];
}

/**
 * Discover — merges what used to be two separate pages (Search and
 * Discover) into one: a name/bio search box, the platform's own
 * highlight rows (Top Baddies, Baddies Near You — same sections/queries
 * the landing page and fan Home use), and browse-by-category underneath.
 * /search redirects here rather than staying a second destination.
 */
export default function DiscoveryPage() {
  const [categories, setCategories] = useState<CategoryItem[] | null>(null);
  const [topCreators, setTopCreators] = useState<CreatorCardData[]>([]);
  const [nearbyCreators, setNearbyCreators] = useState<CreatorCardData[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/categories")
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((body) => {
        if (!cancelled) setCategories(body.categories ?? []);
      });
    fetch("/api/discovery/top-creators")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body: CreatorsResponse) => {
        if (!cancelled) setTopCreators(body.creators ?? []);
      });
    fetch("/api/discovery/nearby-creators")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body: CreatorsResponse) => {
        if (!cancelled) setNearbyCreators(body.creators ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Discover</h1>

      <form onSubmit={handleSearch} style={searchRowStyle}>
        <input
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creators by name or bio..."
        />
        <button type="submit" disabled={searching} style={submitButtonStyle}>
          {searching ? "..." : "Search"}
        </button>
      </form>
      {searchError && <p style={{ color: "var(--danger)" }}>{searchError}</p>}

      {results ? (
        <>
          <CreatorCardRow title={`${results.length} result${results.length === 1 ? "" : "s"}`} creators={results} />
          {results.length === 0 && <p style={{ color: "var(--text-muted)" }}>No creators found.</p>}
        </>
      ) : (
        <>
          <CreatorCardRow title="Top baddies" creators={topCreators} />
          <CreatorCardRow title="baddies near you" creators={nearbyCreators} />

          <section style={sectionWrapStyle}>
            <h2 style={sectionHeadingStyle}>Discover by category</h2>
            {!categories && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
            {categories && categories.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>No categories yet.</p>
            )}
            {categories && categories.length > 0 && (
              <div style={gridStyle}>
                {categories.map((c) => (
                  <Link key={c.id} href={`/discovery/${c.slug}`} style={cardLinkStyle}>
                    <div className="hover-lift" style={cardStyle}>
                      <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{c.name}</div>
                      <div style={mutedSmallStyle}>
                        {c.creatorCount} creator{c.creatorCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const searchRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  margin: "1.5rem 0 3rem",
  maxWidth: "560px",
  marginLeft: "auto",
  marginRight: "auto",
};

const submitButtonStyle: React.CSSProperties = {
  padding: "0.7rem 1.25rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  flexShrink: 0,
};

// Matches the spacing used between sections on fan Home/landing —
// clearly-separated categories on a page that stacks several of them.
const sectionWrapStyle: React.CSSProperties = { marginBottom: "4rem" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1.25rem",
};

// Flexbox + wrap + justify-content: center — see CreatorCardRow's own
// comment in cards.tsx: this centers every row, including a partial
// last one, the way CSS grid's justify-content alone does not.
const gridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.25rem",
  justifyContent: "center",
};

const cardLinkStyle: React.CSSProperties = { textDecoration: "none", color: "inherit" };

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "1.75rem 2rem",
  boxShadow: "var(--glow)",
  width: "220px",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem" };
