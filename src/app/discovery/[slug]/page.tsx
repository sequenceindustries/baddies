"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CreatorCardRow } from "@/components/cards";
import type { CreatorCardData } from "@/components/cards";
import { displayHeadingStyle, useSession, SignInGate } from "@/components/ui";

// Signed-out visitors are gated the same as /discovery — see that
// page's comment. No in-app link points here anymore (Discover by
// category was removed), but the route itself still needs the same
// gate for anyone reaching it directly by URL.
export default function CategoryPage() {
  const params = useParams<{ slug: string }>();
  const { user, loading } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [creators, setCreators] = useState<CreatorCardData[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch(`/api/discovery/categories/${params.slug}`)
      .then((r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled && body) {
          setName(body.category.name);
          setCreators(body.creators ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.slug, user]);

  if (loading) return <main style={mainStyle} />;
  if (!user) {
    return <SignInGate message="Create a free account or sign in to browse creators by category." />;
  }

  if (notFound) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Category not found</h1>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>{name ?? "Loading..."}</h1>
      {creators && creators.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No verified creators in this category yet.</p>
      )}
      {creators && creators.length > 0 && <CreatorCardRow creators={creators} />}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };
