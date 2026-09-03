/**
 * Server-side country-of-request lock for creator applications — per
 * product decision, Baddies is only open to South African creators, no
 * exceptions. Unlike Profile.country (a fan's self-reported field, only
 * ever soft-nudged toward accuracy by browser geolocation — see
 * useLocationDetector's own comment on why that "can't be airtight"),
 * this reads the request's actual network origin, so an applicant can't
 * just type "South Africa" into a text field from anywhere in the world.
 *
 * Resolution order:
 *  1. `x-vercel-ip-country` — set automatically by Vercel's edge network
 *     on every request in production. Zero setup, zero added latency.
 *  2. `cf-ipcountry` — the equivalent header if ever fronted by
 *     Cloudflare instead.
 *  3. A keyless, HTTPS IP-geolocation lookup (ipwho.is) as a last-resort
 *     fallback for any other host. Slower (one extra network round trip)
 *     and best-effort, so it only runs when neither header is present.
 *
 * In development/test, always resolves to South Africa so local work and
 * the test suite aren't blocked by network-dependent geolocation — set
 * GEO_LOCK_DISABLED=false to actually exercise the real lock locally.
 */

export const SOUTH_AFRICA_ISO2 = "ZA";

export function isSouthAfrica(country: string | null): boolean {
  return country === SOUTH_AFRICA_ISO2;
}

export async function getRequestCountry(req: Request): Promise<string | null> {
  if (process.env.NODE_ENV !== "production" && process.env.GEO_LOCK_DISABLED !== "false") {
    return SOUTH_AFRICA_ISO2;
  }

  const headerCountry =
    req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry");
  if (headerCountry) return headerCountry.toUpperCase();

  const ip = getClientIp(req);
  if (!ip) return null;

  try {
    const res = await fetch(`https://ipwho.is/${ip}`);
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.success) return null;
    return typeof body.country_code === "string" ? body.country_code.toUpperCase() : null;
  } catch {
    // Geolocation lookup failing shouldn't crash the request — callers
    // treat a null country as "not South Africa" (see requireSouthAfrica),
    // so this fails closed, not open.
    return null;
  }
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return (forwarded.split(",")[0] ?? forwarded).trim();
  return req.headers.get("x-real-ip");
}

/** The message shown to a rejected applicant, and reused by the client-side eligibility banner — one string, not two that can drift apart. */
export const NOT_SOUTH_AFRICA_MESSAGE =
  "Baddies is currently open to South African creators only, no exceptions. Applications from outside South Africa can't be accepted.";
