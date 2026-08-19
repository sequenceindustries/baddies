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
 * Same full-bleed treatment as ContentCard (contentCardStyle/
 * cardMediaLayerStyle/the two gradient scrims) so every card on the
 * platform — a post or a creator — reads as one visual system: the photo
 * fills the card, byline centered top, status pinned top-right, location
 * and a plain "Get Exclusive" CTA (no price — see priceRowStyle) in the
 * bottom scrim. Unlike ContentCard the whole card is a single Link
 * (there's no separate "expand" affordance to protect from a click), so
 * the byline here is a plain span, not a nested Link.
 *
 * The background image falls back thumbnail -> avatar -> initial-letter
 * box on a load error at each step, rather than ever showing a blank
 * broken-image box — see the thumbFailed/avatarFailed state below.
 */
export function CreatorCard({ creator, size = "md" }: { creator: CreatorCardData; size?: "md" | "lg" }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const location = [creator.city, creator.country].filter(Boolean).join(", ");
  const showThumb = Boolean(creator.thumbnailUrl) && !thumbFailed;
  const showAvatarAsMedia = !showThumb && Boolean(creator.avatarUrl) && !avatarFailed;
  const width = size === "lg" ? "380px" : "300px";

  return (
    <Link href={`/creators/${creator.creatorProfileId}`} style={cardLinkStyle}>
      <div className="hover-lift" style={{ ...contentCardStyle, width }}>
        {showThumb ? (
          creator.thumbnailMimeType?.startsWith("video/") ? (
            <video src={creator.thumbnailUrl!} muted style={cardMediaLayerStyle} onError={() => setThumbFailed(true)} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.thumbnailUrl!} alt="" style={cardMediaLayerStyle} onError={() => setThumbFailed(true)} />
          )
        ) : showAvatarAsMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl!} alt="" style={cardMediaLayerStyle} onError={() => setAvatarFailed(true)} />
        ) : (
          <div style={cardMediaFallbackStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", color: "var(--accent)" }}>
              {initial}
            </span>
          </div>
        )}

        <div style={cardTopScrimStyle}>
          <span style={cardCreatorLinkStyle}>
            <CardAvatar url={creator.avatarUrl} initial={initial} />
            {creator.displayName ?? "Unnamed creator"}
          </span>
          <div style={cardTopScrimBadgeStyle}>
            {creator.isLive && <span style={liveBadgeStyle}>● LIVE</span>}
            <VerifiedBadge />
          </div>
        </div>

        <div style={cardBottomScrimStyle}>
          {location && <div style={cardTimeStyle}>{location}</div>}
          <div style={priceRowStyle}>
            <span>Get Exclusive</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CreatorCardRow({
  title,
  creators,
  size,
  scroll,
}: {
  title?: string;
  creators: CreatorCardData[];
  size?: "md" | "lg";
  // Horizontal-scrolling single row instead of a wrapped, centered grid —
  // for a smaller/highlight row (e.g. the landing page) where sliding
  // through cards reads better than several stacked rows.
  scroll?: boolean;
}) {
  if (creators.length === 0) return null;
  return (
    <section style={sectionStyle}>
      {title && <h2 style={sectionHeadingStyle}>{title}</h2>}
      {/* Flexbox + wrap + justify-content: center — unlike CSS grid, this
          centers every row including a partial last row (e.g. 1 card
          left over after 4 fit per row), which grid's justify-content
          only does for the whole block, not each wrapped row. */}
      <div style={scroll ? creatorScrollRowStyle : creatorGridStyle}>
        {creators.map((c) => (
          <div key={c.creatorProfileId} style={scroll ? creatorScrollItemStyle : undefined}>
            <CreatorCard creator={c} size={size} />
          </div>
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
    <div
      className="hover-lift"
      style={{ ...contentCardStyle, cursor: media ? "zoom-in" : "default" }}
      onClick={() => media && setExpanded(true)}
      role={media ? "button" : undefined}
      aria-label={media ? "Open full size" : undefined}
    >
      {/* Full-bleed photo as the card's own background layer — everything
          else (byline, tier label, caption, actions) sits on top of it in
          gradient-scrimmed overlays, rather than the media being one
          element among several stacked in a padded card. */}
      {media ? (
        <MediaPreview
          mimeType={media.mimeType}
          url={media.signedUrl}
          // A signed URL that 404s/403s once mounted (expired, or the
          // underlying blob never actually existed) falls straight back
          // to the same loading/denied UI below, Retry button included,
          // instead of leaving a blank broken-image box on the card.
          onError={() => {
            setMedia(null);
            setError("This media couldn't load.");
          }}
        />
      ) : (
        <div style={cardMediaFallbackStyle}>
          {loading ? (
            <span style={mutedSmallStyle}>Loading...</span>
          ) : denied && item.accessLevel === "VIP" ? (
            <button onClick={(e) => { e.stopPropagation(); handleGetVipPass(); }} style={ghostSmallButtonStyle}>
              Get VIP Pass to unlock
            </button>
          ) : denied ? (
            <span style={mutedSmallStyle}>Locked</span>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); handleView(); }} style={ghostSmallButtonStyle}>
              Retry
            </button>
          )}
          {denied && item.accessLevel === "VVIP" && (
            <div style={mutedSmallStyle}>Subscribe on this creator&apos;s profile to unlock.</div>
          )}
          {error && <div style={{ ...mutedSmallStyle, color: "var(--danger)" }}>{error}</div>}
        </div>
      )}

      <div style={cardTopScrimStyle}>
        {item.creatorDisplayName && item.creatorProfileId && (
          <Link
            href={`/creators/${item.creatorProfileId}`}
            style={cardCreatorLinkStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <CardAvatar url={item.creatorAvatarUrl} initial={item.creatorDisplayName.charAt(0).toUpperCase()} />
            {item.creatorDisplayName}
          </Link>
        )}
        <div style={cardTopScrimBadgeStyle}>
          <TierBadge accessLevel={item.accessLevel} />
        </div>
      </div>

      <div style={cardBottomScrimStyle}>
        {item.caption && <p style={captionStyle}>{item.caption}</p>}
        <div style={cardFooterStyle}>
          {item.publishedAt && <span style={cardTimeStyle}>{timeAgo(item.publishedAt)}</span>}
          <div style={cardFooterActionsStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={toggleLike} disabled={likeBusy} style={likeButtonStyle(liked)}>
              {liked ? "♥" : "♡"} {likeCount}
            </button>
            <ReportButton contentId={item.contentId} />
          </div>
        </div>
      </div>

      {expanded && media && (
        <MediaLightbox mimeType={media.mimeType} url={media.signedUrl} onClose={() => setExpanded(false)} />
      )}
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

// Fills the card as its background layer (position: absolute, inset: 0 —
// see cardMediaLayerStyle) so the photo/video reads as the whole card,
// not one element stacked among several. Audio has no visual to bleed,
// so it stays a normal in-flow control instead (and never actually
// fails silently the way an <img>/<video> can, so no onError there).
function MediaPreview({ mimeType, url, onError }: { mimeType: string; url: string; onError: () => void }) {
  if (mimeType.startsWith("video/")) {
    return <video src={url} controls style={cardMediaLayerStyle} onError={onError} />;
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <div style={cardMediaFallbackStyle}>
        <audio src={url} controls style={{ width: "90%" }} onClick={(e) => e.stopPropagation()} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={cardMediaLayerStyle} onError={onError} />;
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

// The text-shadow here is only visible when this renders over a content
// card's photo scrim; it's a no-op on the flat backgrounds this button
// also appears against elsewhere (e.g. the creator-profile header).
const reportLinkStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
};

const reportLinkButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  alignSelf: "flex-start",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
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

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

/**
 * The small circular byline avatar (26px) used in both cards' top scrim.
 * Falls back to the initial-letter treatment on a broken/missing url
 * instead of leaving a blank circle — same "always show something real,
 * never an empty box" rule the full-bleed media itself follows.
 */
function CardAvatar({ url, initial }: { url?: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span style={cardCreatorAvatarStyle}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={avatarImgStyle} onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

// Inline now (sits in a flex row next to VerifiedBadge in the top scrim,
// not absolutely positioned over the photo) — see CreatorCard.
const liveBadgeStyle: React.CSSProperties = {
  background: "var(--danger)",
  color: "#fff",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.02em",
  padding: "0.15rem 0.5rem",
  borderRadius: "999px",
  flexShrink: 0,
};

const priceRowStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  justifyContent: "center",
  fontSize: "0.8rem",
  color: "var(--accent)",
  fontWeight: 600,
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)" };

// Matches src/app/(fan)/fan-home/page.tsx's sectionWrapStyle — clearly-
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
// which CSS grid's justify-content does not. Cards are a fixed width
// (set inline in CreatorCard, by size) so rows wrap predictably.
const creatorGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.75rem",
  justifyContent: "center",
};

// Single row, no wrap — cards slide via native horizontal scroll instead
// of stacking into further rows. flexShrink: 0 on each item (see
// creatorScrollItemStyle) keeps every card at its full width rather than
// the row trying to squeeze them all into view at once.
const creatorScrollRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "nowrap",
  gap: "1.75rem",
  overflowX: "auto",
  paddingBottom: "0.5rem",
  scrollSnapType: "x proximity",
};

const creatorScrollItemStyle: React.CSSProperties = {
  flexShrink: 0,
  scrollSnapAlign: "start",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 420px))",
  gap: "1.75rem",
  justifyContent: "center",
};

const gridItemStyle: React.CSSProperties = { minWidth: 0 };

// var(--text) is already near-white (this app is dark-themed throughout),
// so the only thing overlaying it on a photo needs is a drop shadow for
// legibility against busy image content, plus its own stacking context
// above the media layer (z-index: 0) and its gradient scrim.
const captionStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  fontSize: "0.85rem",
  margin: 0,
  color: "var(--text)",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
};

const cardCreatorLinkStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.85rem",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
};

const cardCreatorAvatarStyle: React.CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "var(--accent)",
  overflow: "hidden",
  flexShrink: 0,
};

// Gradient scrims pinned to the top/bottom of the card (contentCardStyle
// is flex column + justify-content: space-between, so these two land at
// the edges) — the same "text over photo" pattern the reference used,
// just with a scrim instead of a solid label background so it works over
// any photo, light or dark. The byline is centered (not space-between)
// so the creator's name reads as centered on the card; any status badge
// (tier/live/verified) is pulled out of this flex row and pinned
// top-right instead via cardTopScrimBadgeStyle, so centering the name
// doesn't get skewed by badge width.
const cardTopScrimStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "0.9rem 1rem 2.5rem",
  background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0))",
};

const cardTopScrimBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: "0.9rem",
  right: "1rem",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const cardBottomScrimStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "2.5rem 1rem 0.9rem",
  background: "linear-gradient(to top, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0))",
};

const cardTimeStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
};

const cardFooterActionsStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
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
    textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
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

// Full-bleed photo card — one style used everywhere content appears
// (creator-profile timeline, Home's grids, everywhere). The photo is the
// whole card (cardMediaLayerStyle, position: absolute inset: 0); byline,
// tier label, caption, and actions sit on top of it in gradient-scrimmed
// overlays instead of the old padded stack of separate rows above/below
// a smaller thumbnail.
const contentCardStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: "18px",
  aspectRatio: "4 / 5",
  background: "var(--surface-raised)",
  boxShadow: "var(--glow)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

// The photo/video itself, filling the card as a background layer.
const cardMediaLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  zIndex: 0,
};

// Loading/locked states render in the same full-bleed slot, centered.
const cardMediaFallbackStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  textAlign: "center",
  padding: "1.5rem",
};

// Bold uppercase text over the photo, not a bordered chip — plain white
// with a drop shadow for legibility on any photo, --accent-colored only
// for the top Exclusive tier so the hierarchy between tiers still reads.
function tierBadgeStyle(accessLevel: ContentCardData["accessLevel"]): React.CSSProperties {
  return {
    position: "relative",
    zIndex: 2,
    fontSize: "0.72rem",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: accessLevel === "VVIP" ? "var(--accent)" : "#fff",
    textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
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
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--bg)" : "var(--text-muted)",
    border: active ? "none" : "1px solid var(--border)",
  };
}
