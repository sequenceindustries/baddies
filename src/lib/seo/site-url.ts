/**
 * The canonical, absolute site origin — used everywhere a URL needs to
 * be absolute rather than relative (metadataBase, robots.txt,
 * sitemap.xml, canonical tags, JSON-LD). Mirrors the exact
 * `process.env.APP_URL ?? "https://baddies.africa"` fallback already
 * used independently across this codebase (src/lib/notifications/*.ts,
 * src/app/api/partner/dashboard/route.ts, src/lib/auth/google.ts) —
 * pulled into one constant here since the new SEO-specific files
 * (sitemap.ts, robots.ts, layout.tsx's metadataBase) all need the same
 * value and benefit from sharing one source rather than repeating the
 * literal three more times.
 */
export const SITE_URL = process.env.APP_URL ?? "https://baddies.africa";
