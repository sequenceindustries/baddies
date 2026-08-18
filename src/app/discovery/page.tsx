"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { displayHeadingStyle } from "@/components/ui";

interface CategoryItem {
  id: string;
  slug: string;
  name: string;
  creatorCount: number;
}

export default function DiscoveryPage() {
  const [categories, setCategories] = useState<CategoryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/categories")
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((body) => {
        if (!cancelled) setCategories(body.categories ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Discover by category</h1>
      {!categories && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {categories && categories.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No categories yet.</p>
      )}
      {categories && categories.length > 0 && (
        <div style={gridStyle}>
          {categories.map((c) => (
            <Link key={c.id} href={`/discovery/${c.slug}`} style={cardLinkStyle}>
              <div style={cardStyle}>
                <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{c.name}</div>
                <div style={mutedSmallStyle}>
                  {c.creatorCount} creator{c.creatorCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: "1rem",
  marginTop: "1.5rem",
};

const cardLinkStyle: React.CSSProperties = { textDecoration: "none", color: "inherit" };

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "1.25rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem" };
