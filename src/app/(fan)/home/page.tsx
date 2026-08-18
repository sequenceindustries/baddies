"use client";

import { useEffect, useState } from "react";
import { CreatorCardRow, ContentGrid, type CreatorCardData, type ContentCardData } from "@/components/cards";
import { displayHeadingStyle } from "@/components/ui";

interface RawContentItem {
  id?: string;
  contentId?: string;
  accessLevel: ContentCardData["accessLevel"];
  priceUsd?: number | string | null;
  caption?: string | null;
  publishedAt?: string | null;
  mediaType?: ContentCardData["mediaType"];
}

interface HomeResponse {
  following: RawContentItem[];
  subscribed: RawContentItem[];
  unlimited: CreatorCardData[];
  recommended: CreatorCardData[];
  trending: RawContentItem[];
  newCreators: CreatorCardData[];
}

function normalize(items: RawContentItem[]): ContentCardData[] {
  return items
    .filter((i) => i.id ?? i.contentId)
    .map((i) => ({
      contentId: (i.id ?? i.contentId) as string,
      accessLevel: i.accessLevel,
      priceUsd: i.priceUsd,
      caption: i.caption,
      publishedAt: i.publishedAt,
      mediaType: i.mediaType,
    }));
}

export default function FanHomePage() {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/home")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load home feed.");
        return r.json();
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your feed. Try refreshing.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Home</h1>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!data && !error && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}

      {data && (
        <>
          {normalize(data.following).length > 0 && (
            <section style={{ marginBottom: "2.25rem" }}>
              <h2 style={sectionHeadingStyle}>Following</h2>
              <ContentGrid items={normalize(data.following)} />
            </section>
          )}

          {normalize(data.subscribed).length > 0 && (
            <section style={{ marginBottom: "2.25rem" }}>
              <h2 style={sectionHeadingStyle}>Your subscriptions</h2>
              <ContentGrid items={normalize(data.subscribed)} />
            </section>
          )}

          <CreatorCardRow title="Unlimited" creators={data.unlimited} />
          <CreatorCardRow title="Recommended creators" creators={data.recommended} />

          {normalize(data.trending).length > 0 && (
            <section style={{ marginBottom: "2.25rem" }}>
              <h2 style={sectionHeadingStyle}>Trending</h2>
              <ContentGrid items={normalize(data.trending)} />
            </section>
          )}

          <CreatorCardRow title="New verified creators" creators={data.newCreators} />

          {normalize(data.following).length === 0 &&
            normalize(data.subscribed).length === 0 &&
            data.unlimited.length === 0 &&
            data.recommended.length === 0 &&
            normalize(data.trending).length === 0 &&
            data.newCreators.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>
                Nothing here yet — once creators publish content, it&apos;ll show up here.
              </p>
            )}
        </>
      )}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 0.85rem",
};
