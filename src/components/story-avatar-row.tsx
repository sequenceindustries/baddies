"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { backdropFade, fadeScale } from "@/lib/motion/tokens";
import { useSession } from "@/components/ui";

// How long an IMAGE story stays on screen before auto-advancing — a
// video story has no fixed duration of its own, it advances on its own
// "ended" event instead (real playback progress, not a guessed number).
const IMAGE_DURATION_MS = 5000;

// "Seen" is tracked client-side only (localStorage, per-viewer/per-
// browser, never synced across devices) — a real per-viewer, server-
// tracked read state is a genuinely bigger feature than this row's own
// display polish needs. Stores { [creatorProfileId]: ISO timestamp last
// viewed }; a creator counts as unseen again once they post something
// newer than that timestamp (compared against their own latestStoryAt),
// not just "have I ever opened this creator" — otherwise a creator who
// posts a fresh story would stay permanently dimmed.
const SEEN_STORAGE_KEY = "baddies:seenStoriesAt";

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

function loadSeenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isSeen(creator: StoryCreator, seenMap: Record<string, string>): boolean {
  const seenAt = seenMap[creator.creatorProfileId];
  if (!seenAt) return false;
  return new Date(seenAt).getTime() >= new Date(creator.latestStoryAt).getTime();
}

/**
 * Real "Stories" carousel, Instagram structure: your own story first (if
 * you have one, labeled "Your story"), everyone else ordered unseen-
 * before-seen (most-recent-first within each group), a dimmed ring once
 * you've viewed a creator's current story set. Tapping through to the
 * end of one creator's stories — or tapping past the end manually —
 * advances straight into the next creator in the row instead of closing
 * (tapping back past the first story of a set does the same in reverse,
 * landing on the previous creator's last story); the viewer only
 * actually closes once you run off either end of the whole row, or tap
 * the ✕/backdrop directly. Backed by GET /api/stories. Renders nothing
 * once there are no active stories anywhere. `refreshKey` lets the feed
 * page force an immediate re-fetch right after the viewer posts their
 * own story.
 */
export function StoryAvatarRow({ refreshKey }: { refreshKey?: number }) {
  const { user } = useSession();
  const ownCreatorProfileId = user?.creatorProfile?.id;

  // Raw fetch result + a seen-state SNAPSHOT taken at fetch time (kept
  // separate from the live seenMap below) — sort order is computed from
  // these via useMemo rather than baked in once at fetch time, because
  // ownCreatorProfileId itself isn't reliably known yet when this first
  // fetch resolves: useSession()'s own /api/auth/me call is async and
  // frequently still in flight at that point (confirmed live — "Your
  // story" landed in the middle of the row, not first, because the sort
  // ran once against ownCreatorProfileId === undefined and never re-ran
  // once the real id arrived). The memo re-sorts for free the moment the
  // session resolves, no second network round-trip required. The live
  // seenMap is intentionally NOT a memo dependency — ring dimming should
  // update immediately after closing a story, but the row's own order
  // shouldn't reshuffle under the viewer mid-session the same way.
  const [rawCreators, setRawCreators] = useState<StoryCreator[] | null>(null);
  const [seenSnapshot, setSeenSnapshot] = useState<Record<string, string>>({});
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerItems, setViewerItems] = useState<StoryItem[] | null>(null);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setSeenMap(loadSeenMap());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stories")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body) => {
        if (cancelled) return;
        setRawCreators(body.creators ?? []);
        setSeenSnapshot(loadSeenMap());
      })
      .catch(() => {
        if (!cancelled) setRawCreators([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const creators = useMemo(() => {
    if (!rawCreators) return null;
    return [...rawCreators].sort((a, b) => {
      const aSelf = a.creatorProfileId === ownCreatorProfileId;
      const bSelf = b.creatorProfileId === ownCreatorProfileId;
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      const aSeen = isSeen(a, seenSnapshot);
      const bSeen = isSeen(b, seenSnapshot);
      if (aSeen !== bSeen) return aSeen ? 1 : -1;
      return new Date(b.latestStoryAt).getTime() - new Date(a.latestStoryAt).getTime();
    });
  }, [rawCreators, ownCreatorProfileId, seenSnapshot]);

  function markSeen(creatorProfileId: string) {
    setSeenMap((prev) => {
      const next = { ...prev, [creatorProfileId]: new Date().toISOString() };
      try {
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private window / blocked storage — seen-state is a cosmetic
        // per-viewer nicety only, never worth failing over.
      }
      return next;
    });
  }

  async function openStoryAt(idx: number, initialIndex = 0) {
    const creator = creators?.[idx];
    if (!creator) return;
    setLoadingId(creator.creatorProfileId);
    try {
      const res = await fetch(`/api/stories/${creator.creatorProfileId}`);
      const body = res.ok ? await res.json() : { items: [] };
      if (body.items?.length > 0) {
        setViewerIndex(idx);
        setViewerItems(body.items);
        setViewerInitialIndex(Math.min(initialIndex, body.items.length - 1));
        markSeen(creator.creatorProfileId);
      }
    } finally {
      setLoadingId(null);
    }
  }

  function closeViewer() {
    setViewerIndex(null);
    setViewerItems(null);
    setViewerInitialIndex(0);
  }

  function goToNextCreator() {
    if (viewerIndex === null || !creators) {
      closeViewer();
      return;
    }
    const nextIdx = viewerIndex + 1;
    if (nextIdx >= creators.length) closeViewer();
    else openStoryAt(nextIdx, 0);
  }

  function goToPrevCreator() {
    if (viewerIndex === null || viewerIndex === 0) return;
    // A huge initial index, clamped down to the real last item once that
    // creator's own items load in openStoryAt above — landing on the
    // tail of the previous creator's set, Instagram convention.
    openStoryAt(viewerIndex - 1, Number.MAX_SAFE_INTEGER);
  }

  if (creators === null || creators.length === 0) return null;

  const viewerCreator = viewerIndex !== null ? creators[viewerIndex] : null;

  return (
    <>
      <div className="story-row-scroll" style={rowStyle}>
        {creators.map((c, idx) => {
          const isSelf = c.creatorProfileId === ownCreatorProfileId;
          const dim = !isSelf && isSeen(c, seenMap);
          return (
            <button
              key={c.creatorProfileId}
              onClick={() => openStoryAt(idx)}
              disabled={loadingId === c.creatorProfileId}
              style={itemStyle}
            >
              <span style={dim ? ringSeenStyle : ringStyle}>
                <span style={avatarStyle}>
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt="" style={avatarImgStyle} />
                  ) : (
                    (c.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"
                  )}
                </span>
              </span>
              <span style={nameStyle}>{isSelf ? "Your story" : (c.displayName ?? "Unnamed")}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {viewerItems && viewerCreator && (
          <StoryViewerOverlay
            key="story-viewer"
            items={viewerItems}
            initialIndex={viewerInitialIndex}
            creator={viewerCreator}
            isSelf={viewerCreator.creatorProfileId === ownCreatorProfileId}
            hasPrevCreator={viewerIndex !== null && viewerIndex > 0}
            onClose={closeViewer}
            onFinished={goToNextCreator}
            onPrevCreator={goToPrevCreator}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Full-bleed story viewer, built from MediaLightbox's template
 * (cards.tsx). An IMAGE stays up for IMAGE_DURATION_MS with its segment
 * bar filling in real time, then advances on its own; a VIDEO tracks its
 * own real playback position (onTimeUpdate) and advances on its own
 * "ended" event rather than a guessed duration. Tapping the right/left
 * half advances/goes back manually at any time. Running past either end
 * of this creator's own story set calls onFinished/onPrevCreator (not
 * onClose directly) — StoryAvatarRow decides whether that means "move to
 * the next/previous creator" or "actually close", matching Instagram's
 * continuous-browsing structure rather than closing after every single
 * creator.
 */
function StoryViewerOverlay({
  items,
  initialIndex,
  creator,
  isSelf,
  hasPrevCreator,
  onClose,
  onFinished,
  onPrevCreator,
}: {
  items: StoryItem[];
  initialIndex: number;
  creator: StoryCreator;
  isSelf: boolean;
  hasPrevCreator: boolean;
  onClose: () => void;
  onFinished: () => void;
  onPrevCreator: () => void;
}) {
  const [index, setIndex] = useState(Math.min(initialIndex, items.length - 1));
  // A real WAAPI/rAF-driven value via motion's animate() instead of a
  // 50ms setInterval nudging React state on every tick — smoother (not
  // fighting React's own render cycle) and exactly what motion's
  // useMotionValue/animate exist for. VIDEO items still drive it
  // directly via .set() from onTimeUpdate below (real playback
  // position, not a guessed duration — unchanged behavior).
  const progress = useMotionValue(0);
  const progressWidth = useTransform(progress, (v) => `${v}%`);
  const current = items[index];

  // Re-lands on the requested initial index whenever a different
  // creator's items load in (items is a fresh array each time
  // StoryAvatarRow opens someone new) — e.g. the LAST item, when the
  // viewer just backed into this creator from the one after them.
  useEffect(() => {
    setIndex(Math.min(initialIndex, items.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Drives the IMAGE auto-advance timer; a no-op for VIDEO, which is
  // driven by the <video> element's own onTimeUpdate/onEnded instead.
  // animate() keeps ticking correctly even while the tab is backgrounded
  // (same reason the old setInterval version was chosen over
  // requestAnimationFrame — a bare rAF loop pauses on an invisible tab,
  // silently freezing the countdown; motion's own animate() is built on
  // top of setInterval/rAF hybrids that don't have that problem for a
  // duration-based tween like this one).
  useEffect(() => {
    progress.set(0);
    if (!current || current.mediaType === "VIDEO") return;
    const controls = animate(progress, 100, {
      duration: IMAGE_DURATION_MS / 1000,
      ease: "linear",
      onComplete: () => goNext(),
    });
    return () => controls.stop();
    // Deliberately only re-runs on index/items change — goNext is stable
    // enough per-render for a one-shot-per-story timer, matching the
    // same pattern this file's own data-fetch effects already use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items]);

  if (typeof document === "undefined") return null;
  if (!current) return null;

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
  }
  function goNext(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (index >= items.length - 1) onFinished();
    else setIndex((i) => i + 1);
  }
  function goPrev(e: React.MouseEvent) {
    e.stopPropagation();
    if (index > 0) setIndex((i) => i - 1);
    else if (hasPrevCreator) onPrevCreator();
  }

  return createPortal(
    <motion.div style={viewerBackdropStyle} onClick={handleClose} role="dialog" aria-modal="true" {...backdropFade}>
      <motion.div style={viewerContentStyle} onClick={(e) => e.stopPropagation()} {...fadeScale}>
        <div style={viewerSegmentsStyle}>
          {items.map((it, i) => (
            <span key={it.storyId} style={viewerSegmentTrackStyle}>
              {i === index ? (
                <motion.span style={{ ...viewerSegmentFillStyle, width: progressWidth }} />
              ) : (
                <span style={{ ...viewerSegmentFillStyle, width: i < index ? "100%" : "0%" }} />
              )}
            </span>
          ))}
        </div>
        <div style={viewerHeaderStyle}>
          <span style={viewerHeaderAvatarStyle}>
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatarUrl} alt="" style={avatarImgStyle} />
            ) : (
              (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"
            )}
          </span>
          <span style={viewerHeaderNameStyle}>{isSelf ? "Your story" : (creator.displayName ?? "Unnamed")}</span>
          <button onClick={handleClose} style={viewerCloseStyle} aria-label="Close">
            ✕
          </button>
        </div>
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
              if (v.duration) progress.set((v.currentTime / v.duration) * 100);
            }}
            onEnded={() => goNext()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.storyId} src={current.signedUrl} alt="" style={viewerMediaStyle} />
        )}
        <button onClick={goPrev} style={{ ...viewerTapZoneStyle, left: 0 }} aria-label="Previous story" />
        <button onClick={goNext} style={{ ...viewerTapZoneStyle, right: 0 }} aria-label="Next story" />
      </motion.div>
    </motion.div>,
    document.body
  );
}

// marginBottom widened per direct feedback ("more space between posts,
// especially between stories and first post") — this row sits directly
// above the feed's own post list, so it needed more separation than the
// general between-posts gap (feedListStyle's own 2.5rem), not less.
// Centered + enlarged per direct request — was left-aligned/68px items,
// which stranded the row against the left edge on a wide feed column
// once it stopped needing to scroll (the common case: a handful of
// creators comfortably fits the row's own width). overflowX:auto is
// kept for whenever the row genuinely doesn't fit (more creators than
// the viewport can hold), same horizontal-scroll behavior as before.
//
// Real, confirmed bug: plain `justify-content: center` on an
// overflow-x:auto flex row clips the first/last items whenever content
// is wider than the container — centering the flex line pushes the
// overflow equally past both edges of the scrollport, so even
// scrolling all the way to the start still cuts the first avatar in
// half (and the last one too at the other end). `safe center` is the
// CSS fix purpose-built for this: center when everything fits, but
// fall back to flex-start (normal, nothing-clipped scrolling) the
// instant it would overflow.
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "safe center",
  gap: "1.3rem",
  overflowX: "auto",
  padding: "0.25rem 0.1rem 0.35rem",
  marginBottom: "3rem",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.4rem",
  background: "none",
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
  width: "92px",
};

// The colored ring is the whole "story" signifier — a plain avatar with
// a gradient-ish accent border, Instagram convention, rather than any
// new visual language. Dimmed once seen (ringSeenStyle) — see isSeen.
const ringStyle: React.CSSProperties = {
  width: "84px",
  height: "84px",
  borderRadius: "50%",
  padding: "3px",
  background: "linear-gradient(135deg, var(--accent), var(--accent-wine))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const ringSeenStyle: React.CSSProperties = {
  ...ringStyle,
  background: "var(--border)",
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
  fontSize: "1.4rem",
  color: "var(--accent)",
};

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const nameStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "92px",
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
  width: "100%",
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

const viewerSegmentsStyle: React.CSSProperties = {
  position: "absolute",
  top: "0.75rem",
  left: "0.75rem",
  right: "0.75rem",
  display: "flex",
  gap: "0.3rem",
  zIndex: 2,
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

// The creator's own avatar+name inside the viewer, Instagram convention
// — "whose story is this" stays visible the whole time you're watching,
// not just inferred from wherever you tapped in the row.
const viewerHeaderStyle: React.CSSProperties = {
  position: "absolute",
  top: "1.5rem",
  left: "0.75rem",
  right: "0.75rem",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  zIndex: 2,
};

const viewerHeaderAvatarStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  overflow: "hidden",
  background: "var(--surface-raised)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#fff",
  flexShrink: 0,
};

const viewerHeaderNameStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "0.85rem",
  fontWeight: 600,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const viewerCloseStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#fff",
  fontSize: "1.2rem",
  cursor: "pointer",
  flexShrink: 0,
  padding: "0.2rem",
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
