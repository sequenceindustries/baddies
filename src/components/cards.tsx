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
  vvipPriceUsd: number;
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
          <span>VVIP ${creator.vvipPriceUsd.toFixed(2)}/mo</span>
        </div>
      </div>
    </Link>
  );
}

export function CreatorCardRow({ title, creators }: { title?: string; creators: CreatorCardData[] }) {
  if (creators.length === 0) return null;
  return (
    <section style={sectionStyle}>
      {title && <h2 style={sectionHeadingStyle}>{title}</h2>}
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
  // FREE/VIP/VVIP — see prisma/schema.prisma's ContentAccessLevel comment.
  // PPV kept in the type only for any stray legacy row; nothing can
  // create it anymore and the UI never offers it.
  accessLevel: "FREE" | "VIP" | "VVIP" | "PPV";
  priceUsd?: number | string | null;
  caption?: string | null;
  publishedAt?: string | null;
  mediaType?: "IMAGE" | "VIDEO" | "AUDIO" | null;
  likeCount?: number;
  viewerHasLiked?: boolean;
}

const ACCESS_LABEL: Record<ContentCardData["accessLevel"], string> = {
  FREE: "Free",
  VIP: "VIP",
  VVIP: "VVIP / Exclusive",
  PPV: "Pay per view",
};

/**
 * Renders a content item. FREE content can actually be viewed inline
 * (fetches its signed media URL on click, since /api/content/:id/media
 * allows anyone for free, live content). VIP content has a real "Get VIP
 * Pass" unlock button — one flat platform-wide price via the dummy
 * /api/checkout/vip-pass route (stub payment provider). VVIP content
 * points fans at the creator's own Subscribe button instead of
 * duplicating a subscribe flow on every card, since it needs that
 * specific creator's price.
 */
export function ContentCard({ item }: { item: ContentCardData }) {
  const [media, setMedia] = useState<{ mimeType: string; signedUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [liked, setLiked] = useState(item.viewerHasLiked ?? false);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const isFree = item.accessLevel === "FREE";
  const isVip = item.accessLevel === "VIP";

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

  async function handleGetVipPass() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/checkout/vip-pass", { method: "POST" });
    if (!res.ok) {
      setLoading(false);
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't get VIP pass.");
      return;
    }
    setUnlocked(true);
    await handleView();
  }

  async function toggleLike() {
    setLikeBusy(true);
    const res = await fetch(`/api/content/${item.contentId}/like`, { method: liked ? "DELETE" : "POST" });
    setLikeBusy(false);
    if (res.ok) {
      const body = await res.json();
      setLiked(body.liked);
      setLikeCount(body.likeCount);
    }
  }

  return (
    <div style={contentCardStyle}>
      {media ? (
        <MediaPreview mimeType={media.mimeType} url={media.signedUrl} />
      ) : (
        <div style={contentThumbStyle}>
          {isFree ? (
            <button onClick={handleView} disabled={loading} style={ghostSmallButtonStyle}>
              {loading ? "Loading..." : "▶ View"}
            </button>
          ) : isVip && !unlocked ? (
            <button onClick={handleGetVipPass} disabled={loading} style={ghostSmallButtonStyle}>
              {loading ? "..." : "🔒 Get VIP Pass to unlock"}
            </button>
          ) : (
            <span style={{ fontSize: "1.4rem" }}>🔒</span>
          )}
        </div>
      )}
      {item.caption && <p style={captionStyle}>{item.caption}</p>}
      <div style={mutedSmallStyle}>{ACCESS_LABEL[item.accessLevel]}</div>
      {item.accessLevel === "VVIP" && (
        <div style={mutedSmallStyle}>Subscribe on this creator&apos;s profile to unlock.</div>
      )}
      {error && <div style={{ ...mutedSmallStyle, color: "var(--danger)" }}>{error}</div>}
      <div style={cardFooterStyle}>
        <button onClick={toggleLike} disabled={likeBusy} style={likeButtonStyle(liked)}>
          {liked ? "♥" : "♡"} {likeCount}
        </button>
        <ReportButton contentId={item.contentId} />
      </div>
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

const REPORT_REASONS = [
  { value: "NON_CONSENSUAL", label: "Non-consensual content" },
  { value: "MINOR_SAFETY", label: "Minor safety" },
  { value: "ILLEGAL_CONTENT", label: "Illegal content" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "SPAM", label: "Spam" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Files a Report (§23 trust & safety) against either a content item or a
 * user — pass exactly one of contentId/reportedUserId, matching
 * POST /api/reports. Reusable across ContentCard and the creator profile
 * page rather than duplicating the form.
 */
export function ReportButton({ contentId, reportedUserId }: { contentId?: string; reportedUserId?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]["value"]>("OTHER");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, reportedUserId, reason, details: details || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      setOpen(false);
    }
  }

  if (done) {
    return <div style={reportLinkStyle}>✓ Reported</div>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={reportLinkButtonStyle}>
        Report
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={reportFormStyle}>
      <select
        style={reportSelectStyle}
        value={reason}
        onChange={(e) => setReason(e.target.value as typeof reason)}
      >
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        style={reportSelectStyle}
        placeholder="Details (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={2000}
      />
      <button type="submit" disabled={submitting} style={reportLinkButtonStyle}>
        {submitting ? "..." : "Submit"}
      </button>
      <button type="button" onClick={() => setOpen(false)} style={reportLinkButtonStyle}>
        Cancel
      </button>
    </form>
  );
}

const reportLinkStyle: React.CSSProperties = { fontSize: "0.72rem", color: "var(--text-muted)" };

const reportLinkButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  alignSelf: "flex-start",
};

const reportFormStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  marginTop: "0.2rem",
};

const reportSelectStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text)",
  fontSize: "0.75rem",
  padding: "0.3rem 0.4rem",
};

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

const cardFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

function likeButtonStyle(liked: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    color: liked ? "var(--accent-wine)" : "var(--text-muted)",
    fontSize: "0.8rem",
    cursor: "pointer",
    padding: 0,
    fontWeight: liked ? 600 : 400,
  };
}
