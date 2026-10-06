"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { backdropFade, fadeScale } from "@/lib/motion/tokens";
import { useSession } from "@/components/ui";

/**
 * Icon-only story-upload trigger, sitting next to FeedComposer's own
 * "Share something new" prompt (src/app/feed/page.tsx) per direct
 * request ("put the button next to share something new... instead of
 * words, use an icon"). Same creatorActive gating FeedComposer already
 * applies — a fan with no creator profile sees neither.
 */
export function StoryComposerButton({ onPosted }: { onPosted: () => void }) {
  const { user } = useSession();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const creatorStatus = user?.creatorProfile?.status;
  const creatorActive = Boolean(creatorStatus) && creatorStatus !== "REJECTED" && creatorStatus !== "BANNED";
  if (!creatorActive) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        style={feedIconButtonStyle}
        aria-label="Add to your story"
        title="Add to your story"
      >
        <StoryIcon />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          if (file) setPendingFile(file);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      <AnimatePresence>
        {pendingFile && (
          <StoryUploadModal
            key="story-upload"
            file={pendingFile}
            onClose={() => setPendingFile(null)}
            onPosted={() => {
              setPendingFile(null);
              onPosted();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function StoryUploadModal({ file, onClose, onPosted }: { file: File; onClose: () => void; onPosted: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  const isVideo = file.type.startsWith("video/");

  if (typeof document === "undefined") return null;

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
  }

  async function post() {
    setSubmitting(true);
    setError(null);
    try {
      const base64Data = await fileToBase64(file);
      const res = await fetch("/api/creator/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: isVideo ? "VIDEO" : "IMAGE", mimeType: file.type, base64Data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : "Couldn't post your story.");
        setSubmitting(false);
        return;
      }
      onPosted();
    } catch {
      setError("Couldn't post your story.");
      setSubmitting(false);
    }
  }

  return createPortal(
    <motion.div style={modalBackdropStyle} onClick={handleClose} role="dialog" aria-modal="true" {...backdropFade}>
      <motion.div style={modalContentStyle} onClick={(e) => e.stopPropagation()} {...fadeScale}>
        <div style={modalPreviewWrapStyle}>
          {isVideo ? (
            <video src={previewUrl} style={modalPreviewMediaStyle} controls muted playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" style={modalPreviewMediaStyle} />
          )}
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}
        <div style={modalActionsStyle}>
          <button type="button" onClick={onClose} disabled={submitting} style={modalGhostButtonStyle}>
            Cancel
          </button>
          <button type="button" onClick={post} disabled={submitting} style={modalPrimaryButtonStyle}>
            {submitting ? "Posting..." : "Post story"}
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.6rem 0 0" }}>Disappears in 24 hours.</p>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// Not exported from upload-form.tsx, so duplicated here — small, pure,
// matches this file's own self-contained-component precedent.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Stories glyph: a segmented ring (the universal "story" cue — the
// same ring StoryAvatarRow draws around avatars) around a single "S".
// Shares SearchIcon's exact drawing spec (src/app/feed/page.tsx) so the
// two flanking icons read as one set: viewBox 0 0 24 24, 20px, stroke
// currentColor at 1.8, round caps/joins, fill none.
function StoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="3.57 3.5"
        transform="rotate(-80 12 12)"
      />
      <path
        d="M14.3 9.4c-.4-.9-1.3-1.5-2.4-1.5-1.3 0-2.3.8-2.3 1.9 0 2.5 4.9 1.5 4.9 4.3 0 1.2-1.1 2-2.5 2-1.2 0-2.2-.6-2.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Shared by both icon-only buttons flanking FeedComposer's larger "+"
// (this one and the feed's DiscoverySearchButton) so they're the same
// size, surface, border and color — one icon set, not two.
export const feedIconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--accent)",
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
  textDecoration: "none",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "1.5rem",
};
const modalContentStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "16px",
  padding: "1.25rem",
  width: "100%",
  maxWidth: "420px",
};
const modalPreviewWrapStyle: React.CSSProperties = {
  borderRadius: "12px",
  overflow: "hidden",
  background: "var(--bg)",
  maxHeight: "60vh",
  display: "flex",
  justifyContent: "center",
};
const modalPreviewMediaStyle: React.CSSProperties = { maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" };
const modalActionsStyle: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.9rem" };
const modalGhostButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  cursor: "pointer",
};
const modalPrimaryButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  cursor: "pointer",
};
