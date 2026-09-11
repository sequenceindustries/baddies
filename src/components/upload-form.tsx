"use client";

import { useEffect, useRef, useState } from "react";
import { cardStyle, Field, inputStyle, errorBannerStyle, primaryButtonStyle } from "@/components/ui";
import { ImageCropStep } from "@/components/image-crop-step";

// FREE/VIP/VVIP only — PPV is retired from the product and was never
// offered here even before this file existed (see the upload route's
// own UploadSchema comment).
type AccessLevel = "FREE" | "VIP" | "VVIP";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB per file — matches the API route's own ceiling
const MAX_ITEMS = 10; // matches the API route's own carousel cap (Instagram's own convention)

/**
 * A real drag-and-drop content uploader — Instagram/TikTok-style
 * dropzone that swaps to a live thumbnail/video preview grid once
 * files are chosen, per direct request ("make the content upload more
 * social media like too"). Originally local to the Profile page's
 * Content tab; pulled out into its own shared component so the feed's
 * own inline composer (src/app/feed/page.tsx, per "create a way for
 * creators to post while on their feed page, without having to go to
 * the dashboard") can reuse the exact same upload logic rather than a
 * second hand-rolled copy of it — this codebase has already had to fix
 * the same bug twice once from exactly that kind of duplication (see
 * persist-public-image.ts's own history with ImageUploadField vs. the
 * old local AvatarField).
 */
export function UploadForm({
  onUploaded,
  bare = false,
  initialFiles,
}: {
  onUploaded: () => void;
  // Skips the outer card chrome + heading — the feed composer already
  // provides its own framing (see FeedComposer) and doesn't want a
  // second nested card border around this one.
  bare?: boolean;
  // Seeds this form with files already chosen elsewhere — see
  // FeedComposer's own hidden file input, which opens the OS picker
  // the instant "+" is tapped (matching StoryComposerButton's existing
  // 1-click pattern) rather than requiring a second click on this
  // form's own dropzone. Only ever consumed once, on mount.
  initialFiles?: File[];
}) {
  const [caption, setCaption] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("FREE");
  const [staged, setStaged] = useState<{ id: string; file: File }[]>([]);
  // Ids (from `staged`) of images still awaiting a crop decision — only
  // image/* files ever enter this queue; video/audio skip cropping
  // entirely. While non-empty, ImageCropStep renders instead of the
  // dropzone/preview grid, one image at a time ("Image X of Y").
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [totalImagesThisBatch, setTotalImagesThisBatch] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live thumbnail/video previews — "here's what you're about to post"
  // feedback instead of a bare filename list. Object URLs are
  // regenerated whenever `staged` changes and every URL this effect
  // created is revoked on the way out (both the next run and unmount),
  // so adding/removing files repeatedly never leaks memory. Also what
  // ImageCropStep crops from while an image is in cropQueue.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = staged.map((s) => URL.createObjectURL(s.file));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [staged]);

  function addFiles(fileList: FileList | File[] | null) {
    setError(null);
    const chosen = Array.from(fileList ?? []);
    const tooLarge = chosen.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooLarge.length > 0) {
      setError(`${tooLarge.length === 1 ? "One file exceeds" : `${tooLarge.length} files exceed`} the 100MB limit and won't be included: ${tooLarge.map((f) => f.name).join(", ")}`);
    }
    const ok = chosen.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (ok.length === 0) return;
    const entries = ok.map((file) => ({ id: crypto.randomUUID(), file }));
    setStaged((prev) => [...prev, ...entries]);
    const imageIds = entries.filter((e) => e.file.type.startsWith("image/")).map((e) => e.id);
    if (imageIds.length > 0) {
      setCropQueue((prev) => [...prev, ...imageIds]);
      setTotalImagesThisBatch((prev) => prev + imageIds.length);
    }
  }

  // Consumes `initialFiles` exactly once, on mount — see the prop's own
  // doc comment above.
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) addFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeFile(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id));
    setCropQueue((prev) => prev.filter((qid) => qid !== id));
  }

  function applyCrop(id: string, croppedFile: File) {
    setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, file: croppedFile } : s)));
    setCropQueue((prev) => prev.filter((qid) => qid !== id));
  }

  function skipCrop(id: string) {
    setCropQueue((prev) => prev.filter((qid) => qid !== id));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  // A fresh batch starts its own "Image X of Y" count at zero, whether
  // the previous batch just submitted successfully or every file was
  // manually removed.
  useEffect(() => {
    if (staged.length === 0) setTotalImagesThisBatch(0);
  }, [staged.length]);

  // One request for the whole batch — every selected file becomes one
  // slide of a single carousel post (see POST /api/creator/content's own
  // items[] schema), not N separate posts. This replaced an earlier
  // sequential-per-file-request loop that silently created N separate
  // Content rows; the picker UI already treated this as "one batch"
  // (one shared caption/access level), the network layer just hadn't
  // caught up until now.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (staged.length === 0) {
      setError("Choose at least one file to upload.");
      return;
    }
    if (staged.length > MAX_ITEMS) {
      setError(`You can post up to ${MAX_ITEMS} files at a time — you have ${staged.length} selected.`);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const items = await Promise.all(
        staged.map(async ({ file }) => ({
          mediaType: file.type.startsWith("video/") ? "VIDEO" : file.type.startsWith("audio/") ? "AUDIO" : "IMAGE",
          mimeType: file.type,
          base64Data: await fileToBase64(file),
        }))
      );

      const res = await fetch("/api/creator/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, accessLevel, caption: caption || undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : "Upload failed.");
        return;
      }
      setCaption("");
      setStaged([]);
      onUploaded();
    } finally {
      setSubmitting(false);
    }
  }

  // Cropping happens strictly between file-selection and caption/tier —
  // while any image still needs a crop decision, everything below (the
  // preview grid, caption, access level, submit) waits.
  const activeCropId = cropQueue[0];
  const activeCropEntry = activeCropId ? staged.find((s) => s.id === activeCropId) : undefined;
  const activeCropPreviewIndex = activeCropEntry ? staged.findIndex((s) => s.id === activeCropId) : -1;

  const body = (
    <form onSubmit={handleSubmit}>
      {error && <div style={{ ...errorBannerStyle, whiteSpace: "pre-line" }}>{error}</div>}

      {activeCropEntry && activeCropPreviewIndex >= 0 && previews[activeCropPreviewIndex] ? (
        <Field label="Crop" hint="Choose a ratio, or keep Original to post it uncropped.">
          <ImageCropStep
            key={activeCropEntry.id}
            file={activeCropEntry.file}
            imageUrl={previews[activeCropPreviewIndex]}
            index={totalImagesThisBatch - cropQueue.length}
            total={totalImagesThisBatch}
            onApply={(croppedFile) => applyCrop(activeCropEntry.id, croppedFile)}
            onSkip={() => skipCrop(activeCropEntry.id)}
          />
        </Field>
      ) : (
        <>
          <Field label="Photos & videos" hint="Up to 100MB per file — drop several at once to post them all together.">
            {staged.length === 0 ? (
              <div
                style={dragActive ? { ...dropzoneStyle, ...dropzoneActiveStyle } : dropzoneStyle}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
              >
                <UploadCloudIcon />
                <span style={dropzoneTextStyle}>Drag photos or videos here, or click to browse</span>
              </div>
            ) : (
              <div style={previewGridStyle}>
                {staged.map(({ id, file }, i) => (
                  <div key={id} style={previewTileStyle}>
                    {file.type.startsWith("video/") ? (
                      <video src={previews[i]} style={previewMediaStyle} muted playsInline />
                    ) : file.type.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[i]} alt="" style={previewMediaStyle} />
                    ) : (
                      <span style={previewAudioIconStyle}>♪</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(id)}
                      style={previewRemoveButtonStyle}
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => fileInputRef.current?.click()} style={previewAddTileStyle} aria-label="Add more files">
                  +
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              style={hiddenFileInputStyle}
            />
          </Field>

          <Field label="Caption" hint="Optional. Applied to every file in this batch.">
            <input style={inputStyle} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} />
          </Field>

          <Field
            label="Access level"
            hint="Teasers: anyone. VIP: unlocked by the platform-wide VIP pass. Exclusive: only your own subscribers."
          >
            <select style={inputStyle} value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}>
              <option value="FREE">Teasers</option>
              <option value="VIP">VIP</option>
              <option value="VVIP">Exclusive</option>
            </select>
          </Field>

          <button type="submit" style={primaryButtonStyle} disabled={submitting}>
            {submitting ? "Uploading..." : "Upload"}
          </button>
        </>
      )}
    </form>
  );

  if (bare) return body;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Upload content</h2>
      <p style={{ ...mutedSmallStyle, marginTop: "-0.6rem", marginBottom: "1.1rem" }}>
        Goes live immediately — no admin approval, no waiting.
      </p>
      {body}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1.1rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" };

const dropzoneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.6rem",
  padding: "2.25rem 1.5rem",
  borderRadius: "16px",
  border: "1.5px dashed var(--border)",
  background: "var(--surface-raised)",
  color: "var(--text-muted)",
  cursor: "pointer",
  marginTop: "0.4rem",
  transition: "border-color 0.15s ease, background 0.15s ease",
};

const dropzoneActiveStyle: React.CSSProperties = {
  border: "1.5px dashed var(--accent)",
  background: "var(--accent-soft)",
};

const dropzoneTextStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  textAlign: "center",
};

// Instagram/TikTok-style "here's what you're about to post" thumbnail
// grid, once at least one file is chosen — replaces the dropzone in
// place rather than sitting below it.
const previewGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  marginTop: "0.4rem",
};

const previewTileStyle: React.CSSProperties = {
  position: "relative",
  width: "84px",
  height: "84px",
  borderRadius: "12px",
  overflow: "hidden",
  background: "var(--surface-raised)",
  flexShrink: 0,
};

const previewMediaStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const previewAudioIconStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.6rem",
  color: "var(--accent)",
};

const previewRemoveButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: "4px",
  right: "4px",
  width: "20px",
  height: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "none",
  background: "rgba(0, 0, 0, 0.65)",
  color: "#fff",
  fontSize: "0.9rem",
  lineHeight: 1,
  cursor: "pointer",
};

const previewAddTileStyle: React.CSSProperties = {
  width: "84px",
  height: "84px",
  borderRadius: "12px",
  border: "1.5px dashed var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: "1.5rem",
  cursor: "pointer",
  flexShrink: 0,
};

const hiddenFileInputStyle: React.CSSProperties = { display: "none" };

function UploadCloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 17.5h8.75a3.25 3.25 0 0 0 .5-6.46 4.5 4.5 0 0 0-8.66-1.59A3.75 3.75 0 0 0 7.5 17.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10.5v6.5M9.5 13l2.5-2.5 2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
