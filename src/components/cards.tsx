"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  // This creator's latest Free post — always safe to show on a
  // discovery card (Free is public the moment it's live, see
  // src/lib/discovery/creator-card.ts), unlike VIP/Exclusive media.
  thumbnailUrl?: string | null;
  thumbnailMimeType?: string | null;
}

/**
 * Same big-thumbnail-first layout as a content post (see ContentCard) so
 * creator-discovery cards and content cards read as one consistent
 * system — the latest Free post standing in for "what does this creator
 * actually post," with the avatar/name/price as a smaller identity row
 * underneath rather than the whole card.
 */
export function CreatorCard({ creator }: { creator: CreatorCardData }) {
  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const location = [creator.city, creator.country].filter(Boolean).join(", ");
  return (
    <Link href={`/creators/${creator.creatorProfileId}`} style={cardLinkStyle}>
      <div className="hover-lift" style={creatorCardStyle}>
        <div style={contentThumbStyle}>
          {creator.thumbnailUrl ? (
            creator.thumbnailMimeType?.startsWith("video/") ? (
              <video src={creator.thumbnailUrl} muted style={mediaElStyle} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.thumbnailUrl} alt="" style={mediaElStyle} />
            )
          ) : creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatarUrl} alt="" style={{ ...mediaElStyle, objectFit: "cover" }} />
          ) : (
            <span style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", color: "var(--accent)" }}>
              {initial}
            </span>
          )}
          {creator.isLive && <span style={liveBadgeStyle}>● LIVE</span>}
        </div>
        <div style={creatorIdentityRowStyle}>
          <div style={avatarStyle}>
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatarUrl} alt="" style={avatarImgStyle} />
            ) : (
              initial
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "0.98rem" }}>{creator.displayName ?? "Unnamed creator"}</div>
            <VerifiedBadge />
          </div>
        </div>
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
      {/* Flexbox + wrap + justify-content: center — unlike CSS grid, this
          centers every row including a partial last row (e.g. 1 card
          left over after 4 fit per row), which grid's justify-content
          only does for the whole block, not each wrapped row. */}
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
  // Present when a card can come from more than one creator in the same
  // feed (Home's Following/VIP Content/Trending) — absent on
  // ContentTimeline, a single creator's own profile, where repeating
  // their name on every post would be redundant with the page header.
  creatorProfileId?: string | null;
  creatorDisplayName?: string | null;
  creatorAvatarUrl?: string | null;
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
  const [expanded, setExpanded] = useState(false);

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
      {item.creatorDisplayName && item.creatorProfileId && (
        <Link href={`/creators/${item.creatorProfileId}`} style={cardCreatorLinkStyle}>
          <span style={cardCreatorAvatarStyle}>
            {item.creatorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.creatorAvatarUrl} alt="" style={avatarImgStyle} />
            ) : (
              item.creatorDisplayName.charAt(0).toUpperCase()
            )}
          </span>
          {item.creatorDisplayName}
        </Link>
      )}
      <div style={cardMetaRowStyle}>
        <TierBadge accessLevel={item.accessLevel} />
        {item.publishedAt && <span style={mutedSmallStyle}>{timeAgo(item.publishedAt)}</span>}
      </div>
      {item.caption && <p style={captionStyle}>{item.caption}</p>}
      {media ? (
        <button onClick={() => setExpanded(true)} style={mediaButtonStyle} aria-label="Open full size">
          <MediaPreview mimeType={media.mimeType} url={media.signedUrl} />
        </button>
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
      {expanded && media && <MediaLightbox mimeType={media.mimeType} url={media.signedUrl} onClose={() => setExpanded(false)} />}
    </div>
  );
}

/** Full-size view — clicking a card's media opens this instead of only ever showing the cropped card-sized preview. */
/**
 * Rendered via a portal straight onto document.body — not nested inside
 * the card. A `position: fixed` element is only fixed to the viewport
 * when *every* ancestor is transform-free; the card it's opened from
 * sits inside `.hover-lift`, which applies a `transform` on hover, so
 * without the portal the "full screen" overlay ends up boxed inside the
 * card instead of covering the screen.
 */
function MediaLightbox({ mimeType, url, onClose }: { mimeType: string; url: string; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={lightboxBackdropStyle} onClick={onClose} role="dialog" aria-modal="true">
      <button onClick={onClose} style={lightboxCloseStyle} aria-label="Close">
        ✕
      </button>
      <div style={lightboxContentStyle} onClick={(e) => e.stopPropagation()}>
        {mimeType.startsWith("video/") ? (
          <video src={url} controls autoPlay style={lightboxMediaStyle} />
        ) : mimeType.startsWith("audio/") ? (
          <audio src={url} controls autoPlay style={{ width: "100%" }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" style={lightboxMediaStyle} />
        )}
      </div>
    </div>,
    document.body,
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

// Same card shell ContentCard uses (contentCardStyle) — see below.
const creatorCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  padding: "1.1rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  boxShadow: "var(--glow)",
  width: "300px",
};

const creatorIdentityRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
};

const avatarStyle: React.CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "2px solid var(--accent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  fontSize: "0.95rem",
  color: "var(--accent)",
  overflow: "hidden",
  flexShrink: 0,
};

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const liveBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: "0.6rem",
  left: "0.6rem",
  background: "var(--danger)",
  color: "#fff",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.02em",
  padding: "0.15rem 0.5rem",
  borderRadius: "999px",
};

const priceRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  fontSize: "0.8rem",
  color: "var(--accent-gold)",
  fontWeight: 600,
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)" };

// Matches src/app/(fan)/home/page.tsx's sectionWrapStyle — clearly-
// separated categories rather than sections running into each other.
const sectionStyle: React.CSSProperties = { marginBottom: "4rem" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 0.85rem",
};

// Flexbox + wrap + justify-content: center — see CreatorCardRow's
// comment: this centers every wrapped row, including a partial last one,
// which CSS grid's justify-content does not. Cards are a fixed 300px
// (creatorCardStyle) so they read as clearly bigger than the old
// avatar-only cards, matching the same size class as content cards.
const creatorGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.25rem",
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

const cardCreatorLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.85rem",
};

const cardCreatorAvatarStyle: React.CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "var(--accent)",
  overflow: "hidden",
  flexShrink: 0,
};

const mediaButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 0,
  border: "none",
  background: "none",
  cursor: "zoom-in",
};

const lightboxBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.88)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: "2rem",
};

const lightboxContentStyle: React.CSSProperties = {
  maxWidth: "min(92vw, 1100px)",
  maxHeight: "90vh",
};

const lightboxMediaStyle: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "90vh",
  borderRadius: "10px",
  objectFit: "contain",
};

const lightboxCloseStyle: React.CSSProperties = {
  position: "fixed",
  top: "1.25rem",
  right: "1.5rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "50%",
  width: "40px",
  height: "40px",
  fontSize: "1.1rem",
  cursor: "pointer",
  zIndex: 101,
};

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
  position: "relative",
  aspectRatio: "16 / 10",
  background: "var(--surface-raised)",
  borderRadius: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
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
