"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VerifiedBadge } from "./ui";
import { CardAvatar, HeartIcon, MediaLightbox, ReportButton, timeAgo } from "./cards";

export interface PostCardItem {
  contentId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | null;
  accessLevel: "FREE" | "VIP" | "VVIP" | "PPV";
  caption: string | null;
  publishedAt: string | null;
  likeCount: number;
  tipCount: number;
  viewerHasLiked: boolean;
  creator: {
    creatorProfileId: string;
    displayName: string | null;
    avatarUrl: string | null;
    coverImageUrl: string | null;
    isFoundingPartner: boolean;
    isFoundingBaddie: boolean;
  };
  lock: {
    locked: boolean;
    kind: "VIP_PASS" | "VVIP_SUBSCRIBE" | null;
    priceUsd: number | null;
    ctaLabel: string | null;
  };
  context: "following" | "trending" | null;
}

const CONTEXT_LABEL: Record<NonNullable<PostCardItem["context"]>, string> = {
  following: "Following",
  trending: "🔥 Trending",
};

/**
 * Twitter/X-style post card — the social-feed redesign's replacement
 * for ContentCard on fan-home/discovery/profile. Header row (avatar,
 * name, VerifiedBadge, timestamp, context chip) → caption → media as a
 * normal in-flow block (not ContentCard's full-bleed cropped
 * background-scrim treatment) → the engagement row BELOW the media
 * (like/message/tip/share, icon+count) — the explicit Twitter-vs-
 * Instagram distinction from the redesign brief. ContentCard itself
 * is untouched; this is a new, separate component.
 */
export function PostCard({ item, onLockChange }: { item: PostCardItem; onLockChange?: (unlocked: boolean) => void }) {
  const [media, setMedia] = useState<{ mimeType: string; signedUrl: string } | null>(null);
  const [loading, setLoading] = useState(!item.lock.locked);
  const [locked, setLocked] = useState(item.lock.locked);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [liked, setLiked] = useState(item.viewerHasLiked);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [heartPopKey, setHeartPopKey] = useState<number | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [tipCount, setTipCount] = useState(item.tipCount);
  const [shareCopied, setShareCopied] = useState(false);
  const lastTapRef = useRef(0);
  const pendingTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef(false);

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
    if (body.media?.[0]) {
      setMedia(body.media[0]);
      setLocked(false);
      onLockChange?.(true);
    }
  }

  // Locked cards never call /media at all — the list route already
  // told us it's locked, so there's no point paying for a guaranteed
  // 403 round trip. Unlocked cards fetch on first render.
  useEffect(() => {
    if (!locked) fetchMedia();
    // Only ever auto-fires once per mounted card, same as ContentCard's
    // own handleView effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function handleMediaTap() {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;

    if (isDoubleTap) {
      // Cancel the first tap's still-pending "open the lightbox" timer
      // — without this, a genuine double-tap-to-like would still pop
      // the lightbox open ~300ms later regardless.
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

    // A single tap opens the full view, but only after waiting out the
    // double-tap window — cancelable by the branch above if a second
    // tap actually arrives in time.
    if (media) {
      pendingTapTimeoutRef.current = setTimeout(() => {
        setExpanded(true);
        pendingTapTimeoutRef.current = null;
      }, 300);
    }
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
    <article style={postCardStyle}>
      <header style={postHeaderStyle}>
        <Link href={`/creators/${item.creator.creatorProfileId}`} style={postHeaderLinkStyle}>
          <CardAvatar
            url={item.creator.avatarUrl}
            initial={(item.creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"}
          />
          <span style={postCreatorNameStyle}>{item.creator.displayName ?? "Unnamed creator"}</span>
        </Link>
        <VerifiedBadge isFoundingPartner={item.creator.isFoundingPartner} isFoundingBaddie={item.creator.isFoundingBaddie} />
        {item.publishedAt && <span style={postTimeStyle}>· {timeAgo(item.publishedAt)}</span>}
        {item.context && <span style={postContextChipStyle}>· {CONTEXT_LABEL[item.context]}</span>}
      </header>

      {item.caption && <p style={postCaptionStyle}>{item.caption}</p>}

      <div style={postMediaWrapStyle} onClick={handleMediaTap} role="button" aria-label="Post media">
        {locked ? (
          <LockedMediaBlock item={item} unlocking={unlocking} onUnlock={handleUnlock} error={error} />
        ) : media ? (
          <>
            {media.mimeType.startsWith("video/") ? (
              <video src={media.signedUrl} controls style={postMediaElementStyle} />
            ) : media.mimeType.startsWith("audio/") ? (
              <audio src={media.signedUrl} controls style={{ width: "100%" }} onClick={(e) => e.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.signedUrl} alt="" style={postMediaElementStyle} />
            )}
            {heartPopKey && (
              <HeartPop key={heartPopKey} onDone={() => setHeartPopKey(null)} />
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
        <button onClick={() => setTipOpen(true)} style={engagementButtonStyle(false)} aria-label="Tip">
          <TipIcon />
          {tipCount > 0 && <span>{tipCount}</span>}
        </button>
        <button onClick={handleShare} style={engagementButtonStyle(false)} aria-label="Share">
          <ShareIcon />
          {shareCopied && <span style={{ fontSize: "0.72rem" }}>Copied</span>}
        </button>
        <ReportButton contentId={item.contentId} />
      </div>

      {expanded && media && <MediaLightbox mimeType={media.mimeType} url={media.signedUrl} onClose={() => setExpanded(false)} />}
      {tipOpen && (
        <TipModal
          contentId={item.contentId}
          onClose={() => setTipOpen(false)}
          onSent={(newCount) => {
            setTipCount(newCount);
            setTipOpen(false);
          }}
        />
      )}
      {messageOpen && (
        <ComposeMessageModal creatorProfileId={item.creator.creatorProfileId} onClose={() => setMessageOpen(false)} />
      )}
    </article>
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

function ComposeMessageModal({ creatorProfileId, onClose }: { creatorProfileId: string; onClose: () => void }) {
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

const TIP_PRESETS_USD = [5, 10, 25];

function TipModal({
  contentId,
  onClose,
  onSent,
}: {
  contentId: string;
  onClose: () => void;
  onSent: (newTipCount: number) => void;
}) {
  const [amount, setAmount] = useState<number>(TIP_PRESETS_USD[0]!);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/content/${contentId}/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUsd: effectiveAmount, message: message || undefined }),
    });
    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Couldn't send your tip.");
      return;
    }
    const body = await res.json();
    onSent(body.tipCount);
  }

  return (
    <ModalPortal onClose={onClose} title="Send a tip">
      <div style={tipPresetRowStyle}>
        {TIP_PRESETS_USD.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              setAmount(preset);
              setCustomAmount("");
            }}
            style={tipPresetButtonStyle(!customAmount && amount === preset)}
          >
            ${preset}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        max={500}
        placeholder="Custom amount ($)"
        value={customAmount}
        onChange={(e) => setCustomAmount(e.target.value)}
        style={modalInputStyle}
      />
      <input
        type="text"
        placeholder="Add a message (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={500}
        style={modalInputStyle}
      />
      {error && <p style={{ ...mutedSmallStyle, color: "var(--danger)" }}>{error}</p>}
      <div style={modalActionsStyle}>
        <button onClick={onClose} style={modalGhostButtonStyle}>
          Cancel
        </button>
        <button
          onClick={send}
          disabled={sending || !effectiveAmount || effectiveAmount < 1}
          style={modalPrimaryButtonStyle}
        >
          {sending ? "Sending..." : `Tip $${effectiveAmount || 0}`}
        </button>
      </div>
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

function TipIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v10M9.5 9.5c0-1.1 1.12-2 2.5-2s2.5.9 2.5 2-1.12 2-2.5 2-2.5.9-2.5 2 1.12 2 2.5 2 2.5-.9 2.5-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)" };

const postCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
};

const postHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const postHeaderLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.9rem",
};

const postCreatorNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "200px",
};

const postTimeStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--text-muted)" };
const postContextChipStyle: React.CSSProperties = { fontSize: "0.8rem", color: "var(--accent)" };

const postCaptionStyle: React.CSSProperties = { fontSize: "0.92rem", color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" };

const postMediaWrapStyle: React.CSSProperties = {
  position: "relative",
  borderRadius: "14px",
  overflow: "hidden",
  background: "var(--surface-raised)",
  minHeight: "220px",
  display: "flex",
  cursor: "pointer",
};

const postMediaElementStyle: React.CSSProperties = {
  width: "100%",
  maxHeight: "620px",
  objectFit: "contain",
  display: "block",
  background: "#000",
};

const postMediaLoadingStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "220px",
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

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text)",
  padding: "0.6rem",
  fontSize: "0.88rem",
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

const tipPresetRowStyle: React.CSSProperties = { display: "flex", gap: "0.5rem" };

function tipPresetButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "0.5rem",
    borderRadius: "8px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent)" : "var(--surface-raised)",
    color: active ? "var(--bg)" : "var(--text)",
    border: active ? "none" : "1px solid var(--border)",
  };
}
