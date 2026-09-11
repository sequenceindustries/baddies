"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
// Required for react-easy-crop's own positioning/overlay rules (the
// container's absolute layout, the darkened-outside-the-crop-box
// overlay, the grid lines) — this library ships real CSS, not just
// inline styles, unlike every other visual in this app. The one
// deliberate exception to this codebase's "everything is inline
// React.CSSProperties" convention, scoped to this one file.
import "react-easy-crop/react-easy-crop.css";

// The 3 presets, chosen against this app's own real display contexts
// (not abstractly against a generic convention) — see this project's
// own plan notes for the full reasoning:
//   - Square 1:1  → matches GridThumbnail's default tile (square).
//   - Portrait 4:5 → matches PostCard/CreatorCard's own feed/card
//     display box (postMediaWrapStyle, contentCardStyle).
//   - Story 9:16  → the one full-bleed/tall ratio nothing else already
//     covers, and the user's own explicit example.
// "Original" (aspect = null) is always available and selected by
// default, so cropping is never forced on a creator who just wants to
// post the photo as-is.
const RATIO_PRESETS: { label: string; aspect: number | null }[] = [
  { label: "Original", aspect: null },
  { label: "Square", aspect: 1 },
  { label: "Portrait", aspect: 4 / 5 },
  { label: "Story", aspect: 9 / 16 },
];

/**
 * One image's crop decision, shown one at a time for a multi-image
 * carousel ("Image X of Y") — each photo gets its own real framing
 * rather than one ratio forced across a whole batch. Video/audio never
 * reach this component (see UploadForm's own cropQueue, which only
 * ever enqueues image/* files). Crop happens entirely client-side on a
 * canvas before the file is ever base64-encoded — the server's own
 * resize pipeline (generateDisplayVariant) needs no changes, it just
 * receives an already-cropped image exactly as it does any other.
 */
export function ImageCropStep({
  file,
  imageUrl,
  index,
  total,
  onApply,
  onSkip,
}: {
  file: File;
  imageUrl: string;
  index: number;
  total: number;
  onApply: (croppedFile: File) => void;
  onSkip: () => void;
}) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  function selectRatio(nextAspect: number | null) {
    setAspect(nextAspect);
    // Fresh framing per ratio switch — carrying over a previous
    // ratio's pan/zoom onto a differently-shaped crop box reads as
    // broken (the visible frame jumps to somewhere unrelated).
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }

  async function handleApply() {
    if (aspect === null || !croppedAreaPixels) return;
    setApplying(true);
    try {
      const croppedFile = await getCroppedImageFile(imageUrl, croppedAreaPixels, file.name, file.type);
      onApply(croppedFile);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div style={wrapStyle}>
      {total > 1 && (
        <div style={counterStyle}>
          Image {index + 1} of {total}
        </div>
      )}

      <div style={stageStyle}>
        {aspect === null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" style={originalPreviewStyle} />
        ) : (
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        )}
      </div>

      {aspect !== null && (
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={zoomSliderStyle}
          aria-label="Zoom"
        />
      )}

      <div style={ratioRowStyle}>
        {RATIO_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => selectRatio(preset.aspect)}
            style={ratioButtonStyle(aspect === preset.aspect)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div style={actionRowStyle}>
        <button type="button" onClick={onSkip} style={skipButtonStyle}>
          Skip
        </button>
        {aspect !== null && (
          <button type="button" onClick={handleApply} disabled={applying || !croppedAreaPixels} style={applyButtonStyle}>
            {applying ? "Applying..." : "Apply crop"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Standard react-easy-crop canvas-crop pattern (draws the visible crop
 * rect onto a canvas at its native pixel size, then exports a Blob) —
 * wrapped into a File carrying the original name/type so the rest of
 * UploadForm's pipeline (fileToBase64, the media-type sniff in
 * handleSubmit) keeps working unmodified.
 */
async function getCroppedImageFile(
  imageUrl: string,
  cropPixels: Area,
  fileName: string,
  mimeType: string
): Promise<File> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to crop image."))),
      mimeType || "image/jpeg",
      0.9
    );
  });

  return new File([blob], fileName, { type: mimeType || "image/jpeg" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const wrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  marginTop: "0.4rem",
};

const counterStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  fontWeight: 600,
};

// react-easy-crop requires a positioned container with an explicit
// height to lay its own absolutely-positioned canvas/image into.
const stageStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "340px",
  borderRadius: "16px",
  overflow: "hidden",
  background: "var(--surface-raised)",
};

const originalPreviewStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

const zoomSliderStyle: React.CSSProperties = {
  width: "100%",
  accentColor: "var(--accent)",
};

// "at the bottom of the crop sections, have auto prepared crop
// options" — per direct request, the ratio presets render below the
// crop stage, not above it.
const ratioRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "center",
};

function ratioButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.45rem 1rem",
    borderRadius: "999px",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent)" : "var(--surface-raised)",
    color: active ? "var(--bg)" : "var(--text)",
    border: active ? "none" : "1px solid var(--border)",
  };
}

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.6rem",
};

const skipButtonStyle: React.CSSProperties = {
  padding: "0.6rem 1.1rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.88rem",
  cursor: "pointer",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
};

const applyButtonStyle: React.CSSProperties = {
  padding: "0.6rem 1.3rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.88rem",
  cursor: "pointer",
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
};
