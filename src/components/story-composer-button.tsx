"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
        style={storyButtonStyle}
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
      {pendingFile && (
        <StoryUploadModal
          file={pendingFile}
          onClose={() => setPendingFile(null)}
          onPosted={() => {
            setPendingFile(null);
            onPosted();
          }}
        />
      )}
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
    <div style={modalBackdropStyle} onClick={handleClose} role="dialog" aria-modal="true">
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>,
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

// Camera glyph — deliberately distinct from FeedComposer's own "+"
// glyph so the two icon-only affordances read as different actions at
// a glance. Same hand-drawn SVG convention as every other icon in this
// codebase: viewBox 0 0 24 24, stroke=currentColor, strokeWidth
// 1.6-1.8, round caps/joins, fill=none, aria-hidden, fixed pixel size.
function StoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l.9-1.5a1 1 0 0 1 .86-.5h5.08a1 1 0 0 1 .86.5l.9 1.5h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// Shrunk to 28px (from 44px) and given an accent ring so this reads as
// "story" rather than just "camera" without a full icon redraw — per
// direct request ("change the stories camera icon into something that
// implies story") and ("plus sign to post must be larger the stories
// and discovery icons, which must be smaller and same size on the
// sides of the +" — this and the new discovery/search icon share the
// same size, both smaller than FeedComposer's own "+"). Bumped again,
// 28px->38px, in the same follow-up pass that enlarged the "+" and
// centered the whole row.
const storyButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: "var(--surface)",
  border: "2px solid var(--accent)",
  color: "var(--accent)",
  cursor: "pointer",
  flexShrink: 0,
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
