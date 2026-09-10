"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// How long an IMAGE story stays on screen before auto-advancing — a
// video story has no fixed duration of its own, it advances on its own
// "ended" event instead (real playback progress, not a guessed number).
const IMAGE_DURATION_MS = 5000;

interface StoryCreator {
  creatorProfileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  latestStoryAt: string;
}

interface StoryItem {
  storyId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO";
  mimeType: string;
  signedUrl: string;
}

/**
 * Real "Stories" carousel — creators with at least one currently-active
 * (unexpired) story, backed by GET /api/stories. Previously this row
 * showed the 20 most-recently-approved creators as a decorative
 * discovery browsing list (see git history) with no real ephemeral-
 * content backing at all; that discovery function isn't lost, the same
 * underlying query still independently powers the landing page's own
 * "New Baddies" section. Renders nothing once there are no active
 * stories anywhere, matching this row's own long-established "empty ->
 * null" convention. `refreshKey` lets the feed page force an immediate
 * re-fetch right after the viewer posts their own story, without a full
 * page reload.
 */
export function StoryAvatarRow({ refreshKey }: { refreshKey?: number }) {
  const [creators, setCreators] = useState<StoryCreator[] | null>(null);
  const [viewerItems, setViewerItems] = useState<StoryItem[] | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stories")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body) => {
        if (!cancelled) setCreators(body.creators ?? []);
      })
      .catch(() => {
        if (!cancelled) setCreators([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function openStory(creatorProfileId: string) {
    setLoadingId(creatorProfileId);
    try {
      const res = await fetch(`/api/stories/${creatorProfileId}`);
      const body = res.ok ? await res.json() : { items: [] };
      if (body.items?.length > 0) setViewerItems(body.items);
    } finally {
      setLoadingId(null);
    }
  }

  if (creators === null || creators.length === 0) return null;

  return (
    <>
      <div className="story-row-scroll" style={rowStyle}>
        {creators.map((c) => (
          <button
            key={c.creatorProfileId}
            onClick={() => openStory(c.creatorProfileId)}
            disabled={loadingId === c.creatorProfileId}
            style={itemStyle}
          >
            <span style={ringStyle}>
              <span style={avatarStyle}>
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt="" style={avatarImgStyle} />
                ) : (
                  (c.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"
                )}
              </span>
            </span>
            <span style={nameStyle}>{c.displayName ?? "Unnamed"}</span>
          </button>
        ))}
      </div>

      {viewerItems && <StoryViewerOverlay items={viewerItems} onClose={() => setViewerItems(null)} />}
    </>
  );
}

/**
 * Full-bleed story viewer, built from MediaLightbox's template
 * (cards.tsx), Instagram-convention auto-advance: an IMAGE stays up for
 * IMAGE_DURATION_MS with its segment bar filling in real time, then
 * advances on its own; a VIDEO tracks its own real playback position
 * (onTimeUpdate) and advances on its own "ended" event rather than a
 * guessed duration. Tapping the right/left half still advances/goes
 * back manually at any time, and auto-closes once the last story in the
 * set finishes (playing or timing out) — same as running out via a
 * manual tap past the end.
 */
function StoryViewerOverlay({ items, onClose }: { items: StoryItem[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0-100, current item only
  const current = items[index];

  // Drives the IMAGE auto-advance timer; a no-op for VIDEO, which is
  // driven by the <video> element's own onTimeUpdate/onEnded instead.
  // setInterval rather than requestAnimationFrame deliberately — rAF is
  // fully paused by the browser whenever the tab/page isn't visible
  // (e.g. the viewer switches tabs mid-story), which would silently
  // freeze the countdown instead of just ticking along in the
  // background like a real timer should.
  useEffect(() => {
    setProgress(0);
    if (!current || current.mediaType === "VIDEO") return;
    const start = Date.now();
    const interval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / IMAGE_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        goNext();
      }
    }, 50);
    return () => clearInterval(interval);
    // Deliberately only re-runs on index change — goNext/onClose are
    // stable enough per-render for a one-shot-per-story timer, matching
    // the same pattern this file's own data-fetch effects already use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (typeof document === "undefined") return null;
  if (!current) return null;

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
  }
  function goNext(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (index >= items.length - 1) onClose();
    else setIndex((i) => i + 1);
  }
  function goPrev(e: React.MouseEvent) {
    e.stopPropagation();
    if (index > 0) setIndex((i) => i - 1);
  }

  return createPortal(
    <div style={viewerBackdropStyle} onClick={handleClose} role="dialog" aria-modal="true">
      <div style={viewerSegmentsStyle} onClick={(e) => e.stopPropagation()}>
        {items.map((it, i) => (
          <span key={it.storyId} style={viewerSegmentTrackStyle}>
            <span
              style={{
                ...viewerSegmentFillStyle,
                width: `${i < index ? 100 : i === index ? progress : 0}%`,
              }}
            />
          </span>
        ))}
      </div>
      <button onClick={handleClose} style={viewerCloseStyle} aria-label="Close">
        ✕
      </button>
      <div style={viewerContentStyle} onClick={(e) => e.stopPropagation()}>
        {current.mediaType === "VIDEO" ? (
          <video
            key={current.storyId}
            src={current.signedUrl}
            style={viewerMediaStyle}
            autoPlay
            playsInline
            controls={false}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress((v.currentTime / v.duration) * 100);
            }}
            onEnded={() => goNext()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.storyId} src={current.signedUrl} alt="" style={viewerMediaStyle} />
        )}
        <button onClick={goPrev} style={{ ...viewerTapZoneStyle, left: 0 }} aria-label="Previous story" />
        <button onClick={goNext} style={{ ...viewerTapZoneStyle, right: 0 }} aria-label="Next story" />
      </div>
    </div>,
    document.body
  );
}

// marginBottom widened per direct feedback ("more space between posts,
// especially between stories and first post") — this row sits directly
// above the feed's own post list, so it needed more separation than the
// general between-posts gap (feedListStyle's own 2.5rem), not less.
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.1rem",
  overflowX: "auto",
  padding: "0.25rem 0.1rem 0.35rem",
  marginBottom: "3rem",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.35rem",
  background: "none",
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
  width: "68px",
};

// The colored ring is the whole "story" signifier — a plain avatar with
// a gradient-ish accent border, Instagram convention, rather than any
// new visual language.
const ringStyle: React.CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "50%",
  padding: "2.5px",
  background: "linear-gradient(135deg, var(--accent), var(--accent-wine))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const avatarStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "2px solid var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  fontWeight: 600,
  fontSize: "1.1rem",
  color: "var(--accent)",
};

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const nameStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "68px",
};

const viewerBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.88)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const viewerContentStyle: React.CSSProperties = {
  position: "relative",
  maxWidth: "min(92vw, 500px)",
  maxHeight: "90vh",
  display: "flex",
};

const viewerMediaStyle: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "90vh",
  objectFit: "contain",
};

const viewerCloseStyle: React.CSSProperties = {
  position: "absolute",
  top: "1.25rem",
  right: "1.25rem",
  background: "transparent",
  border: "none",
  color: "#fff",
  fontSize: "1.3rem",
  cursor: "pointer",
  zIndex: 1,
};

const viewerSegmentsStyle: React.CSSProperties = {
  position: "absolute",
  top: "0.9rem",
  left: "1.25rem",
  right: "1.25rem",
  display: "flex",
  gap: "0.3rem",
};

const viewerSegmentTrackStyle: React.CSSProperties = {
  flex: 1,
  height: "2.5px",
  borderRadius: "2px",
  background: "rgba(255,255,255,0.35)",
  overflow: "hidden",
};

const viewerSegmentFillStyle: React.CSSProperties = {
  display: "block",
  height: "100%",
  background: "#fff",
};

const viewerTapZoneStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: "50%",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};
