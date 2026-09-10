import crypto from "crypto";
import { z } from "zod";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Real, confirmed perf fix: avatarUrl/coverImageUrl were being saved as
// whatever the client sent — and ImageUploadField (components/ui.tsx)
// sends a raw `data:image/...;base64,...` string straight from
// FileReader.readAsDataURL. Zod's `.url()` happily accepts a data: URL
// (it's a syntactically valid URL), so that full base64 blob was being
// persisted verbatim and then embedded inline in every single API
// response that includes creator/profile info (feed, discovery, story
// row, creator pages) — confirmed live on production: a single avatar
// was a ~255,000-character base64 string, duplicated inline wherever
// that creator appeared on a page, never cached, never lazy-loaded,
// downloaded again on every request. This decodes and re-uploads that
// payload through the same MediaStorageProvider content already uses,
// so the DB column and every response ends up holding a short URL
// instead of the raw bytes.
//
// This app's storage abstraction is deliberately signed-URL-only (see
// storage/types.ts's own comment: never a bare public storage URL) —
// so this still goes through getSignedReadUrl rather than adding a new
// unsigned "public" path. Avatars/cover images carry no confidentiality
// requirement (they were already fully visible to anyone signed in,
// via the inline base64 this replaces), so a long TTL here isn't a new
// exposure — it's what makes the resulting URL something a browser can
// actually cache across requests instead of needing to be reissued
// every read like gated content's short-lived signed URLs are. Known,
// accepted tradeoff: the persisted URL does still expire (~1 year) and
// the image would need re-saving past that point — storing the
// storageKey and re-signing per read (like gated content) is the real
// long-term fix, flagged rather than built here.
const PUBLIC_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/s;

// The stub storage provider's signed URLs (src/lib/providers/storage/
// stub.ts's getSignedReadUrl) are same-origin relative paths
// ("/api/dev-stub-media?..."), not absolute — that's what this function
// now persists to avatarUrl/coverImageUrl instead of a raw data: URL.
// Plain z.string().url() rejects a relative path outright, and these
// forms round-trip the currently-stored value back into every save (see
// ProfileSettings' own handleSubmit) — without this, saving any other
// profile field once an avatar was set would 400. Accepts an absolute
// http(s) URL (a real future storage provider's own signed URL shape),
// a same-origin relative path, or a fresh data: URL still awaiting
// persistPublicImage's own conversion above.
export const publicImageUrlSchema = z
  .string()
  .refine((v) => /^https?:\/\//.test(v) || v.startsWith("/") || v.startsWith("data:"), {
    message: "Must be a valid image URL.",
  });

/**
 * Pass a value straight through unless it's a `data:` URL — in which
 * case it's decoded, uploaded to storage under `keyPrefix`, and swapped
 * for a long-lived signed read URL. Null/undefined (clearing a field)
 * and an already-stored URL (unchanged from a previous save) both pass
 * through untouched.
 */
export async function persistPublicImage(
  value: string | null | undefined,
  keyPrefix: string
): Promise<string | null | undefined> {
  if (!value) return value;
  const match = value.match(DATA_URL_PATTERN);
  if (!match) return value;

  const [, contentType, base64Data] = match;
  const body = Buffer.from(base64Data as string, "base64");
  const storage = getMediaStorageProvider();
  const key = `${keyPrefix}/${Date.now()}-${crypto.randomUUID()}`;
  const { storageKey } = await storage.putObject({ key, contentType: contentType as string, body });
  return storage.getSignedReadUrl(storageKey, PUBLIC_IMAGE_TTL_SECONDS);
}
