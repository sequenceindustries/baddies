"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VerifiedBadge } from "./ui";

export interface CreatorCardData {
  creatorProfileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  city: string | null;
  verifiedBadge: true;
  vvipPriceUsd: number;
  isLive?: boolean;
}

export function CreatorCard({ creator }: { creator: CreatorCardData }) {
  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const location = [creator.city, creator.country].filter(Boolean).join(", ");
  return (
    <Link href={`/creators/${creator.creatorProfileId}`} style={cardLinkStyle}>
      <div className="hover-lift" style={creatorCardStyle}>
        <div style={{ position: "relative" }}>
          <div style={avatarStyle}>
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatarUrl} alt="" style={avatarImgStyle} />
            ) : (
              initial
            )}
          </div>
          {creator.isLive && <span style={liveBadgeStyle}>● LIVE</span>}
        </div>
        <div style={{ fontWeight: 600, fontSize: "0.98rem" }}>{creator.displayName ?? "Unnamed creator"}</div>
        <VerifiedBadge />
        {location && <div style={mutedSmallStyle}>{location}</div>}
        <div style={priceRowStyle}>
          <span>Exclusive ${creator.vvipPriceUsd.toFixed(2)}/mo</span>
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
      {/* A wrapping grid, not a horizontal-scroll strip — a row of 3 cards
          and a row of 5 cards both fill the width evenly instead of
          clumping left with a dead gap on wide screens. */}
      <div style={creatorGridStyle}>
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
  VVIP: "Exclusive",
  PPV: "Pay per view",
};

/**
 * Renders a content item. Always tries the real thing first, on mount —
 * no click required to reveal a thumbnail. /api/content/:id/media and
 * the server's entitlement check (src/lib/entitlements/content.ts)
 * decide, rather than the client guessing from local state whether this
 * viewer is unlocked. That guess used to be wrong for anyone reloading
 * the page: a real VVIP subscriber had no way to open VVIP content at
 * all outside the same session they'd just subscribed in, and every
 * thumbnail sat behind an extra click even when the viewer already had
 * access. Only once the server actually says no do we show a
 * tier-specific upsell (Get VIP Pass, or "subscribe on this creator's
 * profile" for VVIP, which needs that specific creator's price and so
 * isn't duplicated here) — a locked thumbnail is the exception now, not
 * the default.
 */
export function ContentCard({ item }: { item: ContentCardData }) {
  const [media, setMedia] = useState<{ mimeType: string; signedUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [liked, setLiked] = useState(item.viewerHasLiked ?? false);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);

  async function handleView() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/content/${item.contentId}/media`);
    setLoading(false);
    if (!res.ok) {
      setDenied(true);
      if (res.status !== 401 && res.status !== 403) {
        setError("Couldn't load this content. Try again.");
      }
      return;
    }
    const body = await res.json();
    if (body.media?.[0]) {
      setMedia(body.media[0]);
      setDenied(false);
    }
  }

  useEffect(() => {
    handleView();
    // Only ever auto-fires once per mounted card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="hover-lift" style={contentCardStyle}>
      <div style={cardMetaRowStyle}>
        <TierBadge accessLevel={item.accessLevel} />
        {item.publishedAt && <span style={mutedSmallStyle}>{timeAgo(item.publishedAt)}</span>}
      </div>
      {item.caption && <p style={captionStyle}>{item.caption}</p>}
      {media ? (
        <MediaPreview mimeType={media.mimeType} url={media.signedUrl} />
      ) : (
        <div style={contentThumbStyle}>
          {loading ? (
            <span style={mutedSmallStyle}>Loading...</span>
          ) : denied && item.accessLevel === "VIP" ? (
            <button onClick={handleGetVipPass} style={ghostSmallButtonStyle}>
              Get VIP Pass to unlock
            </button>
          ) : denied ? (
            <span style={mutedSmallStyle}>Locked</span>
          ) : (
            <button onClick={handleView} style={ghostSmallButtonStyle}>
              Retry
            </button>
          )}
        </div>
      )}
      {denied && item.accessLevel === "VVIP" && (
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

function TierBadge({ accessLevel }: { accessLevel: ContentCardData["accessLevel"] }) {
  return <span style={tierBadgeStyle(accessLevel)}>{ACCESS_LABEL[accessLevel]}</span>;
}

function timeAgo(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

/**
 * OnlyFans-style creator-profile feed: a single reverse-chronological
 * timeline (items already arrive sorted newest-first from
 * /api/creators/:id/content) rather than three permanently-stacked
 * sections. Tier tabs only appear at all once this creator actually has
 * content in more than one tier — a creator who only ever posts Free
 * content shouldn't see empty "VIP"/"Exclusive" tabs cluttering their
 * page.
 */
const TIER_ORDER = ["FREE", "VIP", "VVIP"] as const;

export function ContentTimeline({ items, vvipPriceUsd }: { items: ContentCardData[]; vvipPriceUsd: number }) {
  const present = new Set(items.map((i) => i.accessLevel));
  const tiersPresent = TIER_ORDER.filter((t) => present.has(t));
  // No explicit "All" tab — undefined means unfiltered. Clicking the
  // already-active tier tab again clears it back to unfiltered, so
  // there's still a way back without a dedicated button for it.
  const [tab, setTab] = useState<"FREE" | "VIP" | "VVIP" | undefined>(undefined);
  const showTabs = tiersPresent.length > 1;
  const visible = !tab ? items : items.filter((i) => i.accessLevel === tab);

  if (items.length === 0) {
    return <p style={mutedSmallStyle}>No content yet.</p>;
  }

  const TAB_LABEL: Record<"FREE" | "VIP" | "VVIP", string> = {
    FREE: "Free",
    VIP: "VIP",
    VVIP: vvipPriceUsd ? `Exclusive · $${vvipPriceUsd.toFixed(2)}/mo` : "Exclusive",
  };

  return (
    <div style={timelineWrapStyle}>
      {showTabs && (
        <div style={tabBarStyle}>
          {tiersPresent.map((t) => (
            <button
              key={t}
              onClick={() => setTab((current) => (current === t ? undefined : t))}
              style={tabButtonStyle(tab === t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      <div style={timelineListStyle}>
        {visible.map((item) => (
          <ContentCard key={item.contentId} item={item} />
        ))}
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
        <div key={item.contentId} style={gridItemStyle}>
          <ContentCard item={item} />
        </div>
      ))}
    </div>
  );
}

const cardLinkStyle: React.CSSProperties = { textDecoration: "none", color: "inherit", display: "block" };

const creatorCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "1.15rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.35rem",
  height: "100%",
  boxShadow: "var(--glow)",
  transition: "border-color 0.18s ease, transform 0.18s ease",
};

const avatarStyle: React.CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "2px solid var(--accent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  fontSize: "1.1rem",
  color: "var(--accent)",
  marginBottom: "0.4rem",
  overflow: "hidden",
};

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const liveBadgeStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "0.4rem",
  left: "-0.2rem",
  background: "var(--danger)",
  color: "#fff",
  fontSize: "0.62rem",
  fontWeight: 800,
  letterSpacing: "0.02em",
  padding: "0.1rem 0.4rem",
  borderRadius: "999px",
  boxShadow: "0 0 0 2px var(--surface)",
};

const priceRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  fontSize: "0.8rem",
  color: "var(--accent-gold)",
  fontWeight: 600,
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

// auto-fit (not auto-fill) + justifyContent: center — when there are
// fewer cards than columns that fit, the populated columns center as a
// block instead of jamming left with empty dark space to the right.
const creatorGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 220px))",
  gap: "1rem",
  justifyContent: "center",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 420px))",
  gap: "1.25rem",
  justifyContent: "center",
};

const gridItemStyle: React.CSSProperties = { minWidth: 0 };

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

// --- Timeline (large, Twitter-style post) styles ---

// Centers the whole timeline (tabs + posts) as one column instead of
// pinning it to the left edge of a much wider page, which on a large
// viewport left a huge dead gap down the right side.
const timelineWrapStyle: React.CSSProperties = {
  maxWidth: "620px",
  margin: "0 auto",
};

const timelineListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

// One card style used everywhere content appears — creator-profile
// timeline, Home's grids, everywhere. "Cleaner and larger" than the old
// tiny 1:1 thumbnail grid this replaced.
const contentCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "1.1rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
  boxShadow: "var(--glow)",
};

const cardMetaRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6rem",
};

const contentThumbStyle: React.CSSProperties = {
  aspectRatio: "16 / 10",
  background: "var(--surface-raised)",
  borderRadius: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const mediaElStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "14px",
  display: "block",
  maxHeight: "560px",
  minHeight: "220px",
  objectFit: "cover",
};

function tierBadgeStyle(accessLevel: ContentCardData["accessLevel"]): React.CSSProperties {
  const color =
    accessLevel === "VVIP" ? "var(--accent-gold)" : accessLevel === "VIP" ? "var(--accent-gold-dim)" : "var(--text-muted)";
  return {
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color,
    border: `1px solid ${color}`,
    borderRadius: "999px",
    padding: "0.15rem 0.55rem",
    flexShrink: 0,
  };
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginBottom: "1.25rem",
  flexWrap: "wrap",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.4rem 0.9rem",
    borderRadius: "999px",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent-gold)" : "transparent",
    color: active ? "var(--bg)" : "var(--text-muted)",
    border: active ? "none" : "1px solid var(--border)",
  };
}
