"use client";

import Link from "next/link";
import { useState } from "react";
import { VerifiedBadge } from "./ui";

export interface CreatorCardData {
  creatorProfileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  verifiedBadge: true;
  entryPriceUsd: number;
  vipPriceUsd: number;
}

export function CreatorCard({ creator }: { creator: CreatorCardData }) {
  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <Link href={`/creators/${creator.creatorProfileId}`} style={cardLinkStyle}>
      <div style={creatorCardStyle}>
        <div style={avatarStyle}>
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatarUrl} alt="" style={avatarImgStyle} />
          ) : (
            initial
          )}
        </div>
        <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{creator.displayName ?? "Unnamed creator"}</div>
        <VerifiedBadge />
        {creator.country && <div style={mutedSmallStyle}>{creator.country}</div>}
        <div style={priceRowStyle}>
          <span>Entry ${creator.entryPriceUsd.toFixed(2)}</span>
          <span>VIP ${creator.vipPriceUsd.toFixed(2)}</span>
        </div>
      </div>
    </Link>
  );
}

export function CreatorCardRow({ title, creators }: { title: string; creators: CreatorCardData[] }) {
  if (creators.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>{title}</h2>
      <div style={rowStyle}>
        {creators.map((c) => (
          <CreatorCard key={c.creatorProfileId} creator={c} />
        ))}
      </div>
    </section>
  );
}

export interface ContentCardData {
  contentId: string;
  accessLevel: "PUBLIC_PREVIEW" | "ENTRY" | "VIP" | "PPV";
  priceUsd?: number | string | null;
  caption?: string | null;
  publishedAt?: string | null;
  mediaType?: "IMAGE" | "VIDEO" | "AUDIO" | null;
}

const ACCESS_LABEL: Record<ContentCardData["accessLevel"], string> = {
  PUBLIC_PREVIEW: "Free preview",
  ENTRY: "Entry",
  VIP: "VIP",
  PPV: "Pay per view",
};

/**
 * Renders a content item. PUBLIC_PREVIEW content can actually be viewed
 * inline (fetches its signed media URL on click, since /api/content/:id/media
 * allows anyone for public-preview, live content). Anything else shows a
 * locked state with pricing — actually purchasing/subscribing is a separate,
 * not-yet-built payment flow (providers are still stubs), so this
 * intentionally stops at "here's what it costs," not a working checkout.
 */
export function ContentCard({ item }: { item: ContentCardData }) {
  const [media, setMedia] = useState<{ mimeType: string; signedUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isPreview = item.accessLevel === "PUBLIC_PREVIEW";
  const price = item.priceUsd != null ? Number(item.priceUsd) : null;

  async function handleView() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/content/${item.contentId}/media`);
    setLoading(false);
    if (!res.ok) {
      setError("You don't have access to this content.");
      return;
    }
    const body = await res.json();
    if (body.media?.[0]) setMedia(body.media[0]);
  }

  return (
    <div style={contentCardStyle}>
      {media ? (
        <MediaPreview mimeType={media.mimeType} url={media.signedUrl} />
      ) : (
        <div style={contentThumbStyle}>
          {isPreview ? (
            <button onClick={handleView} disabled={loading} style={ghostSmallButtonStyle}>
              {loading ? "Loading..." : "▶ View"}
            </button>
          ) : (
            <span style={{ fontSize: "1.4rem" }}>🔒</span>
          )}
        </div>
      )}
      {item.caption && <p style={captionStyle}>{item.caption}</p>}
      <div style={mutedSmallStyle}>
        {ACCESS_LABEL[item.accessLevel]}
        {price != null ? ` · $${price.toFixed(2)}` : ""}
      </div>
      {error && <div style={{ ...mutedSmallStyle, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

function MediaPreview({ mimeType, url }: { mimeType: string; url: string }) {
  if (mimeType.startsWith("video/")) {
    return <video src={url} controls style={mediaElStyle} />;
  }
  if (mimeType.startsWith("audio/")) {
    return <audio src={url} controls style={{ width: "100%" }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={mediaElStyle} />;
}

export function ContentGrid({ items }: { items: ContentCardData[] }) {
  if (items.length === 0) {
    return <p style={mutedSmallStyle}>No content yet.</p>;
  }
  return (
    <div style={gridStyle}>
      {items.map((item) => (
        <ContentCard key={item.contentId} item={item} />
      ))}
    </div>
  );
}

const cardLinkStyle: React.CSSProperties = { textDecoration: "none", color: "inherit", flex: "0 0 auto" };

const creatorCardStyle: React.CSSProperties = {
  width: "160px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.35rem",
};

const avatarStyle: React.CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  color: "var(--accent-gold)",
  marginBottom: "0.35rem",
  overflow: "hidden",
};

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const priceRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  marginTop: "0.2rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)" };

const sectionStyle: React.CSSProperties = { marginBottom: "2.25rem" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 0.85rem",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.9rem",
  overflowX: "auto",
  paddingBottom: "0.5rem",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: "1rem",
};

const contentCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "0.85rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const contentThumbStyle: React.CSSProperties = {
  aspectRatio: "1 / 1",
  background: "var(--surface-raised)",
  borderRadius: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const mediaElStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "8px",
  display: "block",
  maxHeight: "260px",
  objectFit: "cover",
};

const captionStyle: React.CSSProperties = { fontSize: "0.85rem", margin: 0, color: "var(--text)" };

const ghostSmallButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.7rem",
  fontSize: "0.8rem",
  cursor: "pointer",
};
