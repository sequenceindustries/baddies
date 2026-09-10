"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
  isFoundingPartner?: boolean;
  isFoundingBaddie?: boolean;
  // This creator's latest Free post — always safe to show on a
  // discovery card (Free is public the moment it's live, see
  // src/lib/discovery/creator-card.ts), unlike VIP/Exclusive media.
  thumbnailUrl?: string | null;
  thumbnailMimeType?: string | null;
}

// FREE/VIP/VVIP — see prisma/schema.prisma's ContentAccessLevel comment.
// PPV kept only for any stray legacy row; nothing can create it anymore
// and the UI never offers it. Still used by the creator-dashboard's own
// content list (creator-facing, not part of the fan-facing social-feed
// redesign) after ContentCard/ContentCardData themselves were retired
// as dead code once the redesign replaced every fan-facing consumer.
export type ContentAccessLevel = "FREE" | "VIP" | "VVIP" | "PPV";

export const ACCESS_LABEL: Record<ContentAccessLevel, string> = {
  FREE: "Teasers",
  VIP: "VIP",
  VVIP: "Exclusive",
  PPV: "Pay per view",
};

/**
 * Same full-bleed treatment as ContentCard (contentCardStyle/
 * cardMediaLayerStyle/the two gradient scrims) so every card on the
 * platform — a post or a creator — reads as one visual system: the photo
 * fills the card, byline centered top, status pinned top-right, location
 * and a plain "Subscribe" CTA (no price — see priceRowStyle) in the
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

        {/* Stacked and centered, not side-by-side — the badge sits
            directly under the name rather than racing it for horizontal
            space next to a long display name. */}
        <div style={creatorCardTopScrimStyle}>
          <span style={{ ...cardCreatorLinkStyle, width: "100%" }}>
            <CardAvatar url={creator.avatarUrl} initial={initial} />
            <span style={cardCreatorNameStyle}>{creator.displayName ?? "Unnamed creator"}</span>
          </span>
          <div style={cardTopScrimBadgeStyle}>
            <VerifiedBadge isFoundingPartner={creator.isFoundingPartner} isFoundingBaddie={creator.isFoundingBaddie} />
          </div>
        </div>

        <div style={cardBottomScrimStyle}>
          {location && <div style={cardTimeStyle}>{location}</div>}
          <div style={priceRowStyle}>
            <span>Subscribe</span>
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
  const scrollRef = useRef<HTMLDivElement>(null);

  if (creators.length === 0) return null;

  // Scrolls by roughly one card's width (plus its gap) at a time,
  // rather than an arbitrary fixed amount, so one click reliably
  // advances a whole card regardless of size="md"/"lg".
  function scrollByCard(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const amount = (card?.offsetWidth ?? 320) + 28;
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  return (
    <section style={sectionStyle}>
      {title && <h2 style={sectionHeadingStyle}>{title}</h2>}
      {/* Flexbox + wrap + justify-content: center — unlike CSS grid, this
          centers every row including a partial last row (e.g. 1 card
          left over after 4 fit per row), which grid's justify-content
          only does for the whole block, not each wrapped row. */}
      <div style={scroll ? sliderWrapStyle : undefined}>
        {scroll && (
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            style={sliderNavButtonStyle("left")}
            aria-label="Scroll left"
          >
            ‹
          </button>
        )}
        <div ref={scrollRef} style={scroll ? creatorScrollRowStyle : creatorGridStyle}>
          {creators.map((c) => (
            <div key={c.creatorProfileId} style={scroll ? creatorScrollItemStyle : undefined}>
              <CreatorCard creator={c} size={size} />
            </div>
          ))}
        </div>
        {scroll && (
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            style={sliderNavButtonStyle("right")}
            aria-label="Scroll right"
          >
            ›
          </button>
        )}
      </div>
    </section>
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
export function MediaLightbox({ mimeType, url, onClose }: { mimeType: string; url: string; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  // Every click handler here calls stopPropagation before onClose: this
  // is rendered via createPortal straight onto document.body, but React
  // still bubbles synthetic events through the *component* tree, not the
  // DOM tree — so an un-stopped click bubbles past this portal boundary
  // to ContentCard's own onClick (which sets expanded back to true),
  // undoing the close in the same tick. Without this, the ✕ button
  // looked like it did nothing at all.
  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
  }
  return createPortal(
    <div style={lightboxBackdropStyle} onClick={handleClose} role="dialog" aria-modal="true">
      <button onClick={handleClose} style={lightboxCloseStyle} aria-label="Close">
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

export function timeAgo(iso: string): string {
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

const cardLinkStyle: React.CSSProperties = { textDecoration: "none", color: "inherit", display: "block" };

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

/**
 * The small circular byline avatar (26px) used in both cards' top scrim.
 * Falls back to the initial-letter treatment on a broken/missing url
 * instead of leaving a blank circle — same "always show something real,
 * never an empty box" rule the full-bleed media itself follows.
 */
export function CardAvatar({ url, initial }: { url?: string | null; initial: string }) {
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

// Matches src/app/feed/page.tsx's sectionWrapStyle — clearly-
// separated categories rather than sections running into each other.
const sectionStyle: React.CSSProperties = { marginBottom: "4rem" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1.75rem",
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

const sliderWrapStyle: React.CSSProperties = { position: "relative" };

function sliderNavButtonStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: "-0.75rem",
    transform: "translateY(-50%)",
    zIndex: 3,
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: "1.4rem",
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "var(--glow)",
  };
}

// flex: 1 + minWidth: 0 (not the row's natural content width) is what
// actually centers this safely: the badge sibling in cardTopScrimStyle
// keeps its own real width as a normal flex item, so the byline's
// available space is exactly "whatever's left," never fighting the
// badge for the same pixels. See cardCreatorNameStyle for how the name
// itself truncates instead of overflowing that space.
const cardCreatorLinkStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "1 1 auto",
  minWidth: 0,
  gap: "0.5rem",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.85rem",
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.7)",
};

// The name itself, inside cardCreatorLinkStyle — truncates with an
// ellipsis rather than overflowing into (or wrapping under) the badge,
// the actual safety net once a very long display name meets a narrow
// card or a wide badge (e.g. "● LIVE" + the Baddie badge together).
const cardCreatorNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
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
// any photo, light or dark. The byline (cardCreatorLinkStyle, flex: 1)
// and the status badge (cardTopScrimBadgeStyle, flex: 0) are real flex
// siblings in this row, not one centered and the other absolutely
// positioned over it — that's what actually prevents them from
// overlapping when both are wide (e.g. a long name next to "● LIVE" +
// the Baddie badge together), rather than just usually not colliding.
const cardTopScrimStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
  padding: "0.9rem 1rem 2.5rem",
  background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0))",
};

const cardTopScrimBadgeStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexShrink: 0,
};

// CreatorCard's own variant: stacked (name, then the badge row directly
// under it) and centered, rather than ContentCard's side-by-side byline/
// tier-badge row — the badge here is "who this account is," not a
// second piece of content metadata competing for the same row.
const creatorCardTopScrimStyle: React.CSSProperties = {
  ...cardTopScrimStyle,
  flexDirection: "column",
  alignItems: "center",
  gap: "0.4rem",
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

// Square corners — this is content being opened full-size to actually
// view it, not a card/chrome element; social-feed follow-up.
const lightboxMediaStyle: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "90vh",
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

// A real drawn heart (rounded twin-lobe top, pointed base) instead of the
// Unicode ♥/♡ glyphs previously used here — those render inconsistently
// across platforms (a flat, dated shape on most systems) and can't take
// the button's own currentColor. filled swaps a solid fill for an
// outline stroke; both share one path so liking never shifts the glyph's
// proportions, only how it's painted.
export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.2l-1.35-1.23C5.9 14.9 3 12.28 3 9.06 3 6.43 5.09 4.4 7.75 4.4c1.5 0 2.94.7 3.85 1.8h.8c.91-1.1 2.35-1.8 3.85-1.8 2.66 0 4.75 2.03 4.75 4.66 0 3.22-2.9 5.84-7.65 9.92L12 20.2z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

