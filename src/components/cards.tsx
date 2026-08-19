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
}

export function CreatorCard({ creator }: { creator: CreatorCardData }) {
  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const location = [creator.city, creator.country].filter(Boolean).join(", ");
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
  VVIP: "Exclusive",
  PPV: "Pay per view",
};

/**
 * Renders a content item. Always tries the real thing first — clicking
 * "View" calls /api/content/:id/media and lets the server's entitlement
 * check (src/lib/entitlements/content.ts) decide, rather than the client
 * guessing from local state whether this viewer is unlocked. That guess
 * used to be wrong for anyone reloading the page: a real VVIP subscriber
 * had no way to open VVIP content at all outside the same session they'd
 * just subscribed in. Only once the server actually says no do we show a
 * tier-specific upsell (Get VIP Pass, or "subscribe on this creator's
 * profile" for VVIP, which needs that specific creator's price and so
 * isn't duplicated here).
 *
 * `size="large"` is the Twitter-style timeline presentation used on a
 * creator's own profile (see ContentTimeline) — big media, not a small
 * grid square. `autoLoad` skips the click for FREE posts in that context
 * so a feed actually reads as a feed instead of a wall of "View" buttons.
 */
export function ContentCard({
  item,
  size = "grid",
  autoLoad = false,
}: {
  item: ContentCardData;
  size?: "grid" | "large";
  autoLoad?: boolean;
}) {
  const [media, setMedia] = useState<{ mimeType: string; signedUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [liked, setLiked] = useState(item.viewerHasLiked ?? false);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const large = size === "large";

  async function handleView() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/content/${item.contentId}/media`);
    setLoading(false);
    setAttempted(true);
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
    if (autoLoad && item.accessLevel === "FREE") {
      handleView();
    }
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
    <div style={large ? timelinePostStyle : contentCardStyle}>
      <div style={large ? timelineMetaRowStyle : undefined}>
        <TierBadge accessLevel={item.accessLevel} />
        {large && item.publishedAt && <span style={mutedSmallStyle}>{timeAgo(item.publishedAt)}</span>}
      </div>
      {item.caption && <p style={captionStyle}>{item.caption}</p>}
      {media ? (
        <MediaPreview mimeType={media.mimeType} url={media.signedUrl} large={large} />
      ) : (
        <div style={large ? largeThumbStyle : contentThumbStyle}>
          {denied && item.accessLevel === "VIP" ? (
            <button onClick={handleGetVipPass} disabled={loading} style={ghostSmallButtonStyle}>
              {loading ? "..." : "🔒 Get VIP Pass to unlock"}
            </button>
          ) : denied ? (
            <span style={{ fontSize: large ? "2rem" : "1.4rem" }}>🔒</span>
          ) : (
            <button onClick={handleView} disabled={loading} style={ghostSmallButtonStyle}>
              {loading ? "Loading..." : attempted ? "▶ Retry" : "▶ View"}
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
  const [tab, setTab] = useState<"ALL" | "FREE" | "VIP" | "VVIP">("ALL");
  const showTabs = tiersPresent.length > 1;
  const visible = !showTabs || tab === "ALL" ? items : items.filter((i) => i.accessLevel === tab);

  if (items.length === 0) {
    return <p style={mutedSmallStyle}>No content yet.</p>;
  }

  const TAB_LABEL: Record<"FREE" | "VIP" | "VVIP", string> = {
    FREE: "Free",
    VIP: "VIP",
    VVIP: vvipPriceUsd ? `Exclusive · $${vvipPriceUsd.toFixed(2)}/mo` : "Exclusive",
  };

  return (
    <div>
      {showTabs && (
        <div style={tabBarStyle}>
          <button onClick={() => setTab("ALL")} style={tabButtonStyle(tab === "ALL")}>
            All
          </button>
          {tiersPresent.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabButtonStyle(tab === t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      <div style={timelineListStyle}>
        {visible.map((item) => (
          <ContentCard key={item.contentId} item={item} size="large" autoLoad={item.accessLevel === "FREE"} />
        ))}
      </div>
    </div>
  );
}

function MediaPreview({ mimeType, url, large }: { mimeType: string; url: string; large?: boolean }) {
  const style = large ? largeMediaElStyle : mediaElStyle;
  if (mimeType.startsWith("video/")) {
    return <video src={url} controls style={style} />;
  }
  if (mimeType.startsWith("audio/")) {
    return <audio src={url} controls style={{ width: "100%" }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={style} />;
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

// --- Timeline (large, Twitter-style post) styles ---

const timelineListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  maxWidth: "620px",
};

const timelinePostStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "1.1rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
};

const timelineMetaRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6rem",
};

const largeThumbStyle: React.CSSProperties = {
  aspectRatio: "16 / 10",
  background: "var(--surface-raised)",
  borderRadius: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const largeMediaElStyle: React.CSSProperties = {
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
