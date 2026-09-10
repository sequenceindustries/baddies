"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession, VerifiedBadge } from "./ui";
import { CardAvatar, HeartIcon, MediaLightbox, ReportButton, timeAgo } from "./cards";

export interface PostCardItem {
  contentId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | null;
  accessLevel: "FREE" | "VIP" | "VVIP" | "PPV";
  caption: string | null;
  publishedAt: string | null;
  likeCount: number;
  viewerHasLiked: boolean;
  creator: {
    creatorProfileId: string;
    displayName: string | null;
    handle: string | null;
    avatarUrl: string | null;
    coverImageUrl: string | null;
    isFoundingPartner: boolean;
    isFoundingBaddie: boolean;
    viewerIsFollowing: boolean;
  };
  lock: {
    locked: boolean;
    kind: "VIP_PASS" | "VVIP_SUBSCRIBE" | null;
    priceUsd: number | null;
    ctaLabel: string | null;
  };
  context: "following" | "trending" | "suggested" | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const CONTEXT_LABEL: Record<NonNullable<PostCardItem["context"]>, string> = {
  following: "Following",
  trending: "Trending",
  suggested: "Suggested for you",
};

/**
 * Twitter/X-style post card — the social-feed redesign's replacement
 * for ContentCard on /feed, Discovery, and creator profiles. Restyled (social-feed
 * follow-up, matching a direct Instagram-post reference) to drop the
 * card's own frame entirely — no background/border, just the header,
 * media, engagement row, and caption stacked in a plain column, relying
 * on the page's own spacing between posts rather than a bordered box
 * per post. Header is now Instagram's own two-line byline (name row,
 * then a muted "why this is here" line underneath — Following/
 * Trending/Suggested for you) plus a real Follow button and a "•••"
 * options menu (Report lives there now, not as a media overlay) on the
 * right. Caption moved to the bottom, under the engagement row,
 * "username caption text" style — also matching the reference exactly
 * rather than just relocating the old caption-under-header line.
 * Tipping was removed entirely in an earlier follow-up; the Tip Prisma
 * model itself is untouched, only that UI and its route are gone.
 * ContentCard itself is untouched; this is a new, separate component.
 */
export function PostCard({ item, onLockChange }: { item: PostCardItem; onLockChange?: (unlocked: boolean) => void }) {
  const [mediaItems, setMediaItems] = useState<{ mimeType: string; signedUrl: string; position: number }[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(!item.lock.locked);
  const [locked, setLocked] = useState(item.lock.locked);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [liked, setLiked] = useState(item.viewerHasLiked);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [heartPopKey, setHeartPopKey] = useState<number | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const lastTapRef = useRef(0);
  const pendingTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const fetchedRef = useRef(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  const media = mediaItems[activeIndex] ?? null;
  const isCarousel = mediaItems.length > 1;

  async function fetchMedia() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/content/${item.contentId}/media`);
    setLoading(false);
    if (!res.ok) {
      setLocked(true);
      fetchedRef.current = false;
      return;
    }
    const body = await res.json();
    if (body.media?.length > 0) {
      setMediaItems(body.media);
      setActiveIndex(0);
      setLocked(false);
      onLockChange?.(true);
    }
  }

  // Real, confirmed perf fix ("the content loads slow"): the feed
  // mounts every item on its current page at once (no virtualization),
  // so fetching every card's media unconditionally on mount meant N
  // simultaneous /media round trips firing the instant the list JSON
  // arrived — cards near the bottom of the page competed for the
  // browser's small per-origin connection pool against ones the viewer
  // hadn't scrolled to yet, slowing down the ones actually on screen.
  // Same IntersectionObserver-gated fetch GridThumbnail already uses
  // for the Discovery/profile grid (see its own comment) — media only
  // loads once a card is actually near the viewport.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Locked cards never call /media at all — the list route already
  // told us it's locked, so there's no point paying for a guaranteed
  // 403 round trip.
  useEffect(() => {
    if (!locked && inView) fetchMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, inView]);

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

  // A single-item post: an unparameterized tap opens the full-view
  // lightbox, exactly as before — zero change for the overwhelming
  // majority of posts. A multi-item (carousel) post drops the lightbox
  // entirely (matching real Instagram — a feed carousel tap navigates,
  // it doesn't zoom) and instead advances/retreats the active slide;
  // double-tap-to-like fires identically either way, from either tap
  // zone, on any item count — same lastTapRef/300ms window throughout.
  function handleMediaTap(direction?: "prev" | "next") {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;

    if (isDoubleTap) {
      // Cancel the first tap's still-pending "open the lightbox/advance
      // the slide" timer — without this, a genuine double-tap-to-like
      // would still fire that ~300ms later regardless.
      if (pendingTapTimeoutRef.current) {
        clearTimeout(pendingTapTimeoutRef.current);
        pendingTapTimeoutRef.current = null;
      }
      // Same entitlement gate as the like button itself — a locked
      // post can't be liked (see that button's own comment).
      if (!liked && !locked) {
        toggleLike();
        setHeartPopKey(now);
      }
      return;
    }

    // A single tap acts, but only after waiting out the double-tap
    // window — cancelable by the branch above if a second tap actually
    // arrives in time.
    if (direction) {
      pendingTapTimeoutRef.current = setTimeout(() => {
        setActiveIndex((i) => clamp(i + (direction === "next" ? 1 : -1), 0, mediaItems.length - 1));
        pendingTapTimeoutRef.current = null;
      }, 300);
    } else if (media) {
      pendingTapTimeoutRef.current = setTimeout(() => {
        setExpanded(true);
        pendingTapTimeoutRef.current = null;
      }, 300);
    }
  }

  // Hand-rolled swipe detection (no gesture library exists anywhere in
  // this codebase) — only active on a real carousel. A genuine swipe is
  // unambiguous (no double-tap window to wait out): it navigates
  // immediately and cancels any pending single-tap timer the same way a
  // real double-tap already does. The 1.5x horizontal-vs-vertical ratio
  // keeps a normal vertical feed-scroll that happens to start on the
  // media from ever being mistaken for a slide change.
  const SWIPE_THRESHOLD_PX = 50;
  function onTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !isCarousel) return;
    const dx = e.changedTouches[0]!.clientX - start.x;
    const dy = e.changedTouches[0]!.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (pendingTapTimeoutRef.current) {
      clearTimeout(pendingTapTimeoutRef.current);
      pendingTapTimeoutRef.current = null;
    }
    setActiveIndex((i) => clamp(i + (dx < 0 ? 1 : -1), 0, mediaItems.length - 1));
  }

  async function handleUnlock() {
    setUnlocking(true);
    setError(null);
    const res = await fetch(
      item.lock.kind === "VIP_PASS" ? "/api/checkout/vip-pass" : "/api/checkout/subscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: item.lock.kind === "VVIP_SUBSCRIBE" ? JSON.stringify({ creatorProfileId: item.creator.creatorProfileId }) : undefined,
      }
    );
    setUnlocking(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't unlock this content.");
      return;
    }
    fetchedRef.current = false;
    setLoading(true);
    await fetchMedia();
  }

  async function handleShare() {
    const url = `${window.location.origin}/creators/${item.creator.creatorProfileId}`;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User cancelled the native share sheet — not an error.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing more we can do without a model
      // to fall back to.
    }
  }

  return (
    <article ref={rootRef} style={postCardStyle}>
      <header style={postHeaderStyle}>
        <Link href={`/creators/${item.creator.creatorProfileId}`} style={postAvatarLinkStyle}>
          <CardAvatar
            url={item.creator.avatarUrl}
            initial={(item.creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"}
          />
        </Link>
        <div style={postHeaderTextColStyle}>
          <div style={postHeaderTopLineStyle}>
            <Link href={`/creators/${item.creator.creatorProfileId}`} style={postCreatorNameStyle}>
              {item.creator.displayName ?? "Unnamed creator"}
            </Link>
            <VerifiedBadge isFoundingPartner={item.creator.isFoundingPartner} isFoundingBaddie={item.creator.isFoundingBaddie} />
            {item.creator.handle && <span style={postHandleStyle}>@{item.creator.handle}</span>}
            {item.publishedAt && <span style={postTimeStyle}>· {timeAgo(item.publishedAt)}</span>}
          </div>
          {item.context && <div style={postContextLineStyle}>{CONTEXT_LABEL[item.context]}</div>}
        </div>
        <FollowButton
          creatorProfileId={item.creator.creatorProfileId}
          initialFollowing={item.creator.viewerIsFollowing}
        />
        <PostOptionsMenu contentId={item.contentId} />
      </header>

      <div
        style={postMediaWrapStyle}
        onClick={isCarousel ? undefined : () => handleMediaTap()}
        onTouchStart={isCarousel ? onTouchStart : undefined}
        onTouchEnd={isCarousel ? onTouchEnd : undefined}
        role="button"
        aria-label="Post media"
      >
        {locked ? (
          <LockedMediaBlock item={item} unlocking={unlocking} onUnlock={handleUnlock} error={error} />
        ) : media ? (
          <>
            {media.mimeType.startsWith("video/") ? (
              <video key={activeIndex} src={media.signedUrl} controls style={postMediaElementStyle} />
            ) : media.mimeType.startsWith("audio/") ? (
              <audio key={activeIndex} src={media.signedUrl} controls style={{ width: "100%" }} onClick={(e) => e.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={activeIndex} src={media.signedUrl} alt="" style={postMediaElementStyle} />
            )}
            {heartPopKey && (
              <HeartPop key={heartPopKey} onDone={() => setHeartPopKey(null)} />
            )}
            {isCarousel && (
              <>
                <button onClick={() => handleMediaTap("prev")} style={{ ...mediaTapZoneStyle, left: 0 }} aria-label="Previous item" />
                <button onClick={() => handleMediaTap("next")} style={{ ...mediaTapZoneStyle, right: 0 }} aria-label="Next item" />
                <div style={mediaDotsWrapStyle}>
                  {mediaItems.map((m, i) => (
                    <span key={m.position} style={mediaDotStyle(i === activeIndex)} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={postMediaLoadingStyle}>
            <span style={mutedSmallStyle}>{loading ? "Loading..." : error ?? "Couldn't load this content."}</span>
          </div>
        )}
      </div>

      <div style={postEngagementRowStyle} onClick={(e) => e.stopPropagation()}>
        {/* Liking still goes through /api/content/:id/like, which
            (unchanged, pre-existing behavior) requires real viewing
            entitlement — you can't like what you can't see. That was
            never reachable before this redesign (a locked post was
            hidden from the feed entirely); now that locked posts are
            deliberately visible, the button has to visibly disable
            itself here rather than silently 403 on tap. */}
        <button
          onClick={toggleLike}
          disabled={likeBusy || locked}
          style={{ ...engagementButtonStyle(liked), opacity: locked ? 0.4 : 1, cursor: locked ? "default" : "pointer" }}
          aria-label="Like"
          title={locked ? "Unlock to like" : undefined}
        >
          <HeartIcon filled={liked} />
          <span>{likeCount}</span>
        </button>
        <button onClick={() => setMessageOpen(true)} style={engagementButtonStyle(false)} aria-label="Message">
          <MessageIcon />
        </button>
        <button onClick={handleShare} style={engagementButtonStyle(false)} aria-label="Share">
          <ShareIcon />
          {shareCopied && <span style={{ fontSize: "0.72rem" }}>Copied</span>}
        </button>
      </div>

      {/* Instagram's own "username caption" convention — bold prefix
          inline with the caption text, at the bottom of the card rather
          than under the header. Uses the real @handle when this creator
          has set one (the reference this whole treatment was matching
          shows a handle here, not a display name), falling back to
          displayName for a creator who hasn't set one yet. */}
      {item.caption && (
        <p style={postCaptionStyle}>
          <Link href={`/creators/${item.creator.creatorProfileId}`} style={postCaptionNameStyle}>
            {item.creator.handle ? `@${item.creator.handle}` : item.creator.displayName ?? "Unnamed creator"}
          </Link>{" "}
          {item.caption}
        </p>
      )}

      {expanded && !isCarousel && media && (
        <MediaLightbox mimeType={media.mimeType} url={media.signedUrl} onClose={() => setExpanded(false)} />
      )}
      {messageOpen && (
        <ComposeMessageModal creatorProfileId={item.creator.creatorProfileId} onClose={() => setMessageOpen(false)} />
      )}
    </article>
  );
}

/**
 * Real Follow/Unfollow toggle, top-right of the header — reuses the
 * exact POST/DELETE /api/creators/:id/follow endpoints the creator
 * profile page's own Follow button already calls. Self-follow (a
 * creator viewing their own post — the suggested pool and a creator's
 * own feed both surface this) is still guarded server-side (400) as
 * defense in depth, but is now also pre-checked here against the
 * viewer's own creatorProfile.id so the button never renders at all —
 * matching the dedicated creator-profile page's own Follow button,
 * which already suppressed this case; PostCard was the one place that
 * hadn't been given the same treatment (found in a full-site bug sweep).
 */
function FollowButton({ creatorProfileId, initialFollowing }: { creatorProfileId: string; initialFollowing: boolean }) {
  const { user } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (following || (user && user.creatorProfile?.id === creatorProfileId)) {
    // Matches Instagram's own "already following" treatment inside a
    // post card: nothing to click, no button at all — the profile page
    // itself (not this card) is where an existing follow gets managed.
    return null;
  }

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorProfileId}/follow`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Couldn't follow.");
      return;
    }
    setFollowing(true);
  }

  return (
    <div style={followWrapStyle}>
      <button onClick={toggleFollow} disabled={busy} style={followButtonStyle}>
        {busy ? "..." : "Follow"}
      </button>
      {error && <span style={followErrorStyle}>{error}</span>}
    </div>
  );
}

/**
 * The "•••" options menu — Report lives here now (social-feed
 * follow-up), not as a media overlay. ReportButton itself is reused
 * completely unmodified: it already renders as a compact link that
 * expands into its own reason/details form, which reads perfectly
 * naturally as the one item in this dropdown. A full-screen transparent
 * backdrop closes the menu on an outside click/tap — simpler than a
 * document-level click listener for a menu this small.
 */
function PostOptionsMenu({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={optionsMenuWrapStyle}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={optionsMenuButtonStyle}
        aria-label="More options"
      >
        <DotsIcon />
      </button>
      {open && (
        <>
          <div style={optionsMenuBackdropStyle} onClick={() => setOpen(false)} />
          <div style={optionsMenuPanelStyle} onClick={(e) => e.stopPropagation()}>
            <ReportButton contentId={contentId} />
          </div>
        </>
      )}
    </div>
  );
}

function HeartPop({ onDone }: { onDone: () => void }) {
  return (
    <div style={heartPopWrapStyle} className="heart-pop" onAnimationEnd={onDone} aria-hidden="true">
      <HeartIcon filled />
    </div>
  );
}

function LockedMediaBlock({
  item,
  unlocking,
  onUnlock,
  error,
}: {
  item: PostCardItem;
  unlocking: boolean;
  onUnlock: () => void;
  error: string | null;
}) {
  const backdrop = item.creator.coverImageUrl ?? item.creator.avatarUrl;
  return (
    <div style={lockedBlockStyle}>
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdrop} alt="" style={lockedBackdropImgStyle} />
      )}
      <div style={lockedScrimStyle} />
      <div style={lockedContentStyle}>
        <LockIcon />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnlock();
          }}
          disabled={unlocking}
          style={unlockButtonStyle}
        >
          {unlocking ? "Unlocking..." : item.lock.ctaLabel ?? "Locked"}
        </button>
        {error && <div style={{ ...mutedSmallStyle, color: "var(--danger)" }}>{error}</div>}
      </div>
    </div>
  );
}

export function ComposeMessageModal({ creatorProfileId, onClose }: { creatorProfileId: string; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/creators/${creatorProfileId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (!res.ok) {
      const responseBody = await res.json().catch(() => null);
      setError(typeof responseBody?.error === "string" ? responseBody.error : "Couldn't send your message.");
      return;
    }
    setSent(true);
  }

  return (
    <ModalPortal onClose={onClose} title="Message creator">
      {sent ? (
        <p style={mutedSmallStyle}>✓ Sent.</p>
      ) : (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="Say something..."
            style={modalTextareaStyle}
            autoFocus
          />
          {error && <p style={{ ...mutedSmallStyle, color: "var(--danger)" }}>{error}</p>}
          <div style={modalActionsStyle}>
            <button onClick={onClose} style={modalGhostButtonStyle}>
              Cancel
            </button>
            <button onClick={send} disabled={sending || body.trim().length === 0} style={modalPrimaryButtonStyle}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </>
      )}
    </ModalPortal>
  );
}

function ModalPortal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  function handleBackdropClick(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
  }
  return createPortal(
    <div style={modalBackdropStyle} onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <span style={modalTitleStyle}>{title}</span>
          <button onClick={onClose} style={modalCloseStyle} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9A2.5 2.5 0 0 1 18.5 17H9l-5 4v-4H5.5A2.5 2.5 0 0 1 3 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12v6.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V12M16 7l-4-4-4 4M12 3v13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)" };

// No frame at all — social-feed follow-up, matching a direct Instagram-
// post reference: no background, no border, no radius, no padding.
// Posts are separated by the feed list's own gap (see /app/feed/
// discovery's own list styles) rather than a bordered box per post.
const postCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

const postHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
};

const postAvatarLinkStyle: React.CSSProperties = { display: "flex", flexShrink: 0 };

// The two-line byline column (name row, then the muted "why this is
// here" line) — flex: 1 + minWidth: 0 so the name can truncate rather
// than pushing the Follow/••• controls off the edge.
const postHeaderTextColStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.05rem",
  textAlign: "left",
};

const postHeaderTopLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  flexWrap: "wrap",
};

const postCreatorNameStyle: React.CSSProperties = {
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.9rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "200px",
};

const postTimeStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--text-muted)" };
const postHandleStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--text-muted)" };

// Muted, plain — matches the reference's "Suggested for you" treatment
// exactly (a subtitle line, not a colored accent chip like the
// original redesign's inline "· Suggested" version).
const postContextLineStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--text-muted)" };

const followWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 };

const followButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
  padding: 0,
};

const followErrorStyle: React.CSSProperties = { fontSize: "0.7rem", color: "var(--danger)", marginTop: "0.2rem" };

const optionsMenuWrapStyle: React.CSSProperties = { position: "relative", flexShrink: 0 };

const optionsMenuButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text)",
  cursor: "pointer",
  padding: "0.2rem",
  display: "flex",
  alignItems: "center",
};

// Covers the viewport so a tap anywhere outside the panel closes it —
// simpler than a document-level click listener for a menu this small.
const optionsMenuBackdropStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 9 };

const optionsMenuPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  zIndex: 10,
  marginTop: "0.3rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "0.75rem",
  minWidth: "180px",
  boxShadow: "var(--glow)",
  textAlign: "left",
};

const postCaptionStyle: React.CSSProperties = {
  fontSize: "0.92rem",
  color: "var(--text)",
  margin: 0,
  whiteSpace: "pre-wrap",
  textAlign: "left",
};

const postCaptionNameStyle: React.CSSProperties = {
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
};

// Fixed 4:5 box (Instagram's own default feed-post ratio) with
// object-fit: cover on the media inside it, per direct feedback ("make
// sure the image fills the container, no black space on the sides") —
// the previous object-fit: contain + black background pillar/letter-
// boxed any photo whose own aspect ratio didn't exactly match the
// rendered width. A fixed box + cover always fills edge-to-edge
// (cropping instead of padding), and as a side effect gives every post
// in the feed the same rhythm while scrolling, matching real feed apps
// rather than every card being a different height.
const postMediaWrapStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: "var(--surface-raised)",
  aspectRatio: "4 / 5",
  display: "flex",
  cursor: "pointer",
  // On top of postCardStyle's own 0.6rem flex gap — per direct
  // feedback ("make space between image and caption and user handle
  // at the top"), the media needed clearer separation from the header
  // above and the caption below than the tighter gaps used elsewhere
  // in the card (e.g. context line to media, engagement row to
  // caption), which stay untouched.
  marginTop: "0.5rem",
  marginBottom: "0.5rem",
};

const postMediaElementStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const postMediaLoadingStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const heartPopWrapStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  pointerEvents: "none",
};

// Left/right invisible tap zones for carousel navigation — same pattern
// as the Stories viewer's own tap zones (story-avatar-row.tsx). Serves
// both mouse click (desktop) and touch tap (mobile); real swipes are
// handled separately via onTouchStart/onTouchEnd on the wrap itself.
const mediaTapZoneStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: "50%",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

// Instagram convention — small dots, bottom-center, only rendered for a
// real carousel (>1 item). Instant index swap, no animation, matching
// this session's own "don't over-build" pattern from the Stories
// viewer's segment bar.
const mediaDotsWrapStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "10px",
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  gap: "5px",
  zIndex: 2,
  pointerEvents: "none",
};

function mediaDotStyle(active: boolean): React.CSSProperties {
  return {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: active ? "#fff" : "rgba(255,255,255,0.45)",
  };
}

const postEngagementRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1.25rem",
};

function engagementButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    background: "none",
    border: "none",
    color: active ? "var(--accent-wine)" : "var(--text-muted)",
    fontSize: "0.82rem",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    padding: 0,
  };
}

const lockedBlockStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: "320px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "var(--bg-elevated)",
};

const lockedBackdropImgStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  filter: "blur(28px) saturate(1.1)",
  transform: "scale(1.15)",
};

const lockedScrimStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0, 0, 0, 0.55)",
};

const lockedContentStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.85rem",
  color: "#fff",
  textAlign: "center",
  padding: "1.5rem",
};

const unlockButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "999px",
  padding: "0.6rem 1.2rem",
  fontWeight: 700,
  fontSize: "0.88rem",
  cursor: "pointer",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: "1.5rem",
};

const modalContentStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1.25rem",
  width: "100%",
  maxWidth: "380px",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const modalTitleStyle: React.CSSProperties = { fontWeight: 600, fontSize: "0.95rem" };

const modalCloseStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  fontSize: "1rem",
  cursor: "pointer",
};

const modalTextareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "90px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text)",
  padding: "0.6rem",
  fontSize: "0.88rem",
  fontFamily: "inherit",
  resize: "vertical",
};

const modalActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.6rem",
};

const modalGhostButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "var(--radius)",
  padding: "0.5rem 0.9rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const modalPrimaryButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.5rem 0.9rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};
