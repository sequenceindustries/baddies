"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CardAvatar } from "./cards";
import { VerifiedBadge } from "./ui";
import { PostCard, type PostCardItem } from "./post-card";

/**
 * Instagram-style dense grid tile — the social-feed redesign's Phase 2
 * (Discovery) and Phase 3 (creator profile grid) both render a grid of
 * these. Deliberately much lighter than ContentCard/PostCard: no
 * caption, no engagement row, just a square media crop with the
 * creator's avatar + VerifiedBadge overlaid bottom-left (same photo-
 * overlay badgeStyle ContentCard/CreatorCard already use — see its own
 * comment). Tapping opens PostDetailOverlay, never a page navigation —
 * matches how Instagram's own grid tap behaves.
 *
 * Media only loads once the tile actually scrolls into view (same
 * IntersectionObserver primitive as the feed's own infinite scroll) and
 * only when the item isn't locked — a locked tile renders the blurred-
 * creator-backdrop treatment and never calls /media at all, avoiding a
 * guaranteed-403 network request for content the viewer can't open yet.
 *
 * `variant="discovery"` is a Discovery-only look (social-feed follow-
 * up): square corners instead of the default rounded tile, and no
 * avatar/VerifiedBadge byline overlay at all — Discovery's grid never
 * receives a locked item in the first place (server-side filtered, see
 * GET /api/feed's own doc comment), so hiding the byline there is a
 * pure density/style choice, not an entitlement one. Omitting the prop
 * (the creator-profile page's own grid use) keeps today's exact look.
 */
export function GridThumbnail({
  item,
  onOpen,
  variant,
}: {
  item: PostCardItem;
  onOpen: () => void;
  variant?: "discovery";
}) {
  const [media, setMedia] = useState<{ mimeType: string; signedUrl: string } | null>(null);
  const [inView, setInView] = useState(false);
  const [failed, setFailed] = useState(false);
  const tileRef = useRef<HTMLButtonElement | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || item.lock.locked || fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/content/${item.contentId}/media`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.media?.[0]) setMedia(body.media[0]);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [inView, item.contentId, item.lock.locked]);

  const backdrop = item.creator.coverImageUrl ?? item.creator.avatarUrl;

  return (
    <button
      ref={tileRef}
      onClick={onOpen}
      // Discovery variant: square corners (0 radius) plus a taller,
      // portrait aspect ratio — 3:4 (width:height) means height =
      // width * 4/3, which combined with the container's own 20% width
      // increase (see discovery/page.tsx's mainStyle) works out to rows
      // 60% taller than the original square tile, per direct follow-up
      // feedback ("columns 20% larger, rows 60% larger"). The
      // creator-profile grid (no variant passed) keeps its original
      // square 1:1 tile untouched.
      style={variant === "discovery" ? { ...tileStyle, borderRadius: 0, aspectRatio: "3 / 4" } : tileStyle}
      aria-label="Open post"
    >
      {item.lock.locked ? (
        <>
          {backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backdrop} alt="" style={tileBlurredImgStyle} />
          )}
          <div style={tileScrimStyle} />
          <LockGlyph />
        </>
      ) : media ? (
        media.mimeType.startsWith("video/") ? (
          <video src={media.signedUrl} muted style={tileMediaStyle} />
        ) : media.mimeType.startsWith("audio/") ? (
          <div style={tileAudioGlyphStyle}>♪</div>
        ) : (
          // SEO Phase 8: real, non-keyword-stuffed alt text — this
          // tile now renders in genuinely public HTML (Discovery,
          // creator-profile grids) since Phase 4. A post's own caption
          // is the most descriptive text available; falls back to
          // crediting the creator when there isn't one.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.signedUrl}
            alt={item.caption || `Photo by ${item.creator.displayName ?? "a baddies creator"}`}
            style={tileMediaStyle}
          />
        )
      ) : (
        <div style={tileLoadingStyle}>{failed && <span style={tileFailedTextStyle}>—</span>}</div>
      )}

      {variant !== "discovery" && (
        <div style={tileBylineStyle}>
          <CardAvatar
            url={item.creator.avatarUrl}
            initial={(item.creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"}
          />
          <span style={tileBadgeWrapStyle}>
            <VerifiedBadge isFoundingPartner={item.creator.isFoundingPartner} isFoundingBaddie={item.creator.isFoundingBaddie} />
          </span>
        </div>
      )}
    </button>
  );
}

function LockGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={tileLockGlyphStyle} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * Full-screen portal opened by a grid tap — fetches the single-item
 * shape from GET /api/content/:id (rather than reusing the grid's own
 * already-in-hand item) so the detail view is always freshly current
 * (like count, lock state) at the moment it's actually opened, not
 * whenever the grid page originally loaded. Renders one real PostCard,
 * unmodified — same component the home feed uses, so unlocking/liking/
 * tipping/messaging all behave identically here.
 */
export function PostDetailOverlay({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const [item, setItem] = useState<PostCardItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content/${contentId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => {
        if (!cancelled) setItem(body);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this post.");
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={overlayBackdropStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={overlayContentStyle} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={overlayCloseStyle} aria-label="Close">
          ✕
        </button>
        {error ? (
          <p style={{ color: "var(--danger)" }}>{error}</p>
        ) : item ? (
          <PostCard item={item} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        )}
      </div>
    </div>,
    document.body
  );
}

const tileStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "1",
  overflow: "hidden",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: 0,
  cursor: "pointer",
  display: "block",
};

const tileMediaStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const tileLoadingStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const tileFailedTextStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "1.2rem" };

const tileAudioGlyphStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "2rem",
  color: "var(--text-muted)",
};

const tileBlurredImgStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  filter: "blur(16px) saturate(1.1)",
  transform: "scale(1.2)",
};

const tileScrimStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
};

const tileLockGlyphStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#fff",
};

const tileBylineStyle: React.CSSProperties = {
  position: "absolute",
  left: "6px",
  bottom: "6px",
  right: "6px",
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  overflow: "hidden",
};

// minWidth: 0 is required for a flex child to actually shrink below its
// content size — without it, text-overflow: ellipsis never gets a
// chance to trigger; the text just gets hard-clipped by the tile's own
// overflow: hidden instead (no "..." shown), which is what happened
// before this was added.
const tileBadgeWrapStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "0.7rem",
};

const overlayBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.8)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  overflowY: "auto",
  zIndex: 100,
  padding: "2rem 1.25rem",
};

const overlayContentStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: "500px",
};

const overlayCloseStyle: React.CSSProperties = {
  position: "absolute",
  top: "-2.5rem",
  right: 0,
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: "1.4rem",
  cursor: "pointer",
};
