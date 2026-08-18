"use client";

import { useState } from "react";
import { CreatorCardRow } from "@/components/cards";
import type { CreatorCardData } from "@/components/cards";
import { displayHeadingStyle, inputStyle } from "@/components/ui";

/**
 * Basic search UI over GET /api/search — ILIKE match on displayName/bio
 * for VERIFIED creators only (see that route's doc comment for why this
 * intentionally stays simple).
 */
export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    setLoading(false);
    if (!res.ok) {
      setError("Search failed.");
      return;
    }
    const body = await res.json();
    setResults(body.creators ?? []);
  }

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Search</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.6rem", margin: "1.25rem 0 2rem" }}>
        <input
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creators by name or bio..."
          autoFocus
        />
        <button type="submit" disabled={loading} style={submitButtonStyle}>
          {loading ? "..." : "Search"}
        </button>
      </form>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {results && (
        <CreatorCardRow title={`${results.length} result${results.length === 1 ? "" : "s"}`} creators={results} />
      )}
      {results && results.length === 0 && <p style={{ color: "var(--text-muted)" }}>No creators found.</p>}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const submitButtonStyle: React.CSSProperties = {
  padding: "0.7rem 1.25rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
  background: "var(--accent-gold)",
  color: "var(--bg)",
  border: "none",
  flexShrink: 0,
};
