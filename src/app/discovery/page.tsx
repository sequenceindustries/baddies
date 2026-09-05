"use client";

import { useEffect, useState } from "react";
import { CreatorCardRow, type CreatorCardData } from "@/components/cards";
import { displayHeadingStyle, inputStyle, useSession, SignInGate } from "@/components/ui";

interface CreatorsResponse {
  creators: CreatorCardData[];
}

/**
 * Discover — merges what used to be two separate pages (Search and
 * Discover) into one: a name/bio search box plus the platform's own
 * highlight rows (Top Baddies, Baddies Near You — same sections/queries
 * the landing page and fan Home use). /search redirects here rather
 * than staying a second destination.
 *
 * Signed-out visitors never see this page's real content — per product
 * decision, the landing page's own Top Baddies row is the only thing an
 * anonymous visitor gets to browse; everything else, this page
 * included, is behind SignInGate.
 */
export default function DiscoveryPage() {
  const { user, loading } = useSession();
  const [topCreators, setTopCreators] = useState<CreatorCardData[]>([]);
  const [nearbyCreators, setNearbyCreators] = useState<CreatorCardData[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
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
  }, [user]);

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
          <CreatorCardRow title="The Baddest" creators={topCreators} />
          <CreatorCardRow title="baddies near you" creators={nearbyCreators} />
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
