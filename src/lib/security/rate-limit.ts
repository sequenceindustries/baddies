import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/security/geo";

/**
 * Minimal in-memory, fixed-window rate limiter — the closest this
 * codebase has to abuse controls (confirmed via grep: nothing like this
 * existed anywhere before). Deliberately simple for V1: a plain in-
 * process Map, keyed by "routeKey:clientIp".
 *
 * Known limitation, stated plainly rather than hidden: this resets on
 * every deploy/restart and does NOT share state across multiple server
 * instances. Fine for this app's current single-instance Railway
 * deployment (confirmed by this project's own build/deploy setup); if
 * this ever runs horizontally scaled, replace the Map below with a
 * shared store (Redis, or the database) without changing any call site
 * — every route calls only checkRateLimit()/rateLimitResponse().
 */
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Cheap, occasional cleanup so `buckets` doesn't grow unbounded over a
// long-running process — not a scheduled job, just a check on every call.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function sweepStaleBuckets() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > SWEEP_INTERVAL_MS) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * `key` should already include both a route identifier and the caller's
 * IP (see rateLimitByIp below) — this function itself doesn't know or
 * care what `key` represents.
 */
export function checkRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  sweepStaleBuckets();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.windowStart + windowMs - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/**
 * Convenience wrapper for the common case: limit a specific route by the
 * caller's IP. `routeKey` should be a short, stable string unique to the
 * route (e.g. "founding-apply", "partner-invite-accept") — never the
 * full URL, which would fragment the bucket per query string.
 */
export function checkRateLimitByIp(req: Request, routeKey: string, limit: number, windowSeconds: number): RateLimitResult {
  const ip = getClientIp(req) ?? "unknown";
  return checkRateLimit(`${routeKey}:${ip}`, limit, windowSeconds);
}

/** A ready-to-return 429 response for a rejected check — same JSON error shape every other route in this app uses. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429, headers: result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : undefined }
  );
}
