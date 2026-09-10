"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
 * (cards.tsx) plus minimal multi-story navigation: tap the right/left
 * half to advance/go back, a static (non-animated, non-timed) segment
 * bar shows progress through the set. Deliberately not a real
 * auto-advancing timed progress bar — that's real added complexity
 * nothing in the request asked for.
 */
function StoryViewerOverlay({ items, onClose }: { items: StoryItem[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);

  if (typeof document === "undefined") return null;
  const current = items[index];
  if (!current) return null;

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
  }
  function goNext(e: React.MouseEvent) {
    e.stopPropagation();
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
          <span key={it.storyId} style={{ ...viewerSegmentStyle, opacity: i <= index ? 1 : 0.35 }} />
        ))}
      </div>
      <button onClick={handleClose} style={viewerCloseStyle} aria-label="Close">
        ✕
      </button>
      <div style={viewerContentStyle} onClick={(e) => e.stopPropagation()}>
        {current.mediaType === "VIDEO" ? (
          <video src={current.signedUrl} style={viewerMediaStyle} autoPlay playsInline controls={false} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.signedUrl} alt="" style={viewerMediaStyle} />
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

const viewerSegmentStyle: React.CSSProperties = {
  flex: 1,
  height: "2.5px",
  borderRadius: "2px",
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
