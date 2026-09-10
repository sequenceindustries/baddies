import { NextRequest, NextResponse } from "next/server";
import { readStubMedia } from "@/lib/providers/storage/stub";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Serves bytes held by the in-memory-adjacent stub media storage provider.
 * Only reachable at all when MEDIA_STORAGE_PROVIDER=stub — every other
 * provider issues its own vendor-hosted signed URL and this route has
 * nothing to serve. Never a substitute for the entitlement check: the
 * signature is only ever handed out by /api/content/:id/media after
 * canAccessContent() already passed (see src/lib/entitlements/content.ts).
 *
 * storageKey travels as a query param rather than a path segment —
 * storage keys contain slashes (e.g. "creators/:id/content/:id"), and even
 * percent-encoded those get decoded before Next's router matches a dynamic
 * path segment against them, breaking a single [key]-style route.
 */
export async function GET(req: NextRequest) {
  if (process.env.MEDIA_STORAGE_PROVIDER !== "stub") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const storageKey = req.nextUrl.searchParams.get("key") ?? "";
  const expires = Number(req.nextUrl.searchParams.get("expires"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";

  const object = storageKey && expires && sig ? await readStubMedia(storageKey, expires, sig) : null;
  if (!object) {
    return NextResponse.json({ error: "This link has expired or is invalid." }, { status: 404 });
  }

  // Cache lifetime tracks how long this specific signed URL is actually
  // still good for, rather than a flat 60s — a short-TTL gated-content
  // URl (the default 5min) keeps roughly today's behavior, while a
  // long-TTL one (avatars/cover images — see persist-public-image.ts's
  // own comment on why those are signed for ~1 year) becomes genuinely
  // browser-cacheable instead of being re-fetched on every render.
  // Never longer than what the signature itself already permits — a
  // cached response can't outlive its own authorization.
  const maxAge = Math.max(0, Math.min(Math.floor((expires - Date.now()) / 1000), 60 * 60 * 24 * 365));

  return new NextResponse(object.body, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": `private, max-age=${maxAge}`,
    },
  });
}
