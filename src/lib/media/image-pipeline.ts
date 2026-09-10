import sharp from "sharp";

// 2048px covers the feed's 4:5 post box and the full-screen MediaLightbox
// on a large desktop viewport without ever upscaling a smaller original
// (withoutEnlargement below). WebP only, not an AVIF+WebP pair: post-card/
// grid-thumbnail set <img src={signedUrl}> to a URL the BROWSER fetches
// directly from R2 — our server never sees that <img> tag's own Accept
// header, only the JSON call that asked for the signed URL. Real per-
// client format negotiation would need a same-origin image-proxy route
// streaming every view through our server, which is exactly the "media
// through our own server" pattern the signed-URL architecture exists to
// avoid. WebP alone (near-universal support) already captures the real
// win here: shrinking uncapped, unresized phone-camera originals.
const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 82;

export interface DisplayVariant {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
}

/**
 * Generates a capped-dimension WebP derivative of an uploaded image for
 * actual viewer rendering (see MediaAssetKind.DISPLAY). Returns null on
 * decode failure so the caller can fall back to serving the original
 * untouched rather than failing the whole upload — this should be rare
 * in practice since callers are expected to already reject undecodable
 * images earlier via getImageDimensions.
 */
export async function generateDisplayVariant(input: Buffer): Promise<DisplayVariant | null> {
  try {
    const { data, info } = await sharp(input)
      // rotate() with no args auto-orients from EXIF then strips the
      // orientation tag — and re-encoding via .webp() below drops the
      // rest of the EXIF block too, so no GPS/device metadata rides
      // along into the derivative. A real, incidental privacy win.
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, mimeType: "image/webp" };
  } catch {
    return null;
  }
}

/** Decodes just enough to report dimensions; null if the bytes aren't a real image. */
export async function getImageDimensions(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}
