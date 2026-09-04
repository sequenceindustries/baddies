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

/**
 * Which of the resolution paths in getRequestLocation() actually produced
 * the result — recorded on the Location model (see prisma/schema.prisma)
 * as part of the MASTER REQUIREMENTS §1 audit trail for every founding
 * application, accepted or rejected.
 */
export type LocationDetectionSignal =
  | "vercel-header"
  | "cloudflare-header"
  | "ip-geolocation"
  | "dev-bypass";

export interface RequestLocation {
  country: string | null;
  signal: LocationDetectionSignal;
}

/**
 * Single source of truth for both the detected country AND which signal
 * produced it — getRequestCountry() below is a thin wrapper kept for the
 * existing call sites that only need the country. Resolution order
 * unchanged from before this was split out.
 */
export async function getRequestLocation(req: Request): Promise<RequestLocation> {
  if (process.env.NODE_ENV !== "production" && process.env.GEO_LOCK_DISABLED !== "false") {
    return { country: SOUTH_AFRICA_ISO2, signal: "dev-bypass" };
  }

  const vercelCountry = req.headers.get("x-vercel-ip-country");
  if (vercelCountry) return { country: vercelCountry.toUpperCase(), signal: "vercel-header" };

  const cfCountry = req.headers.get("cf-ipcountry");
  if (cfCountry) return { country: cfCountry.toUpperCase(), signal: "cloudflare-header" };

  const ip = getClientIp(req);
  if (!ip) return { country: null, signal: "ip-geolocation" };

  try {
    const res = await fetch(`https://ipwho.is/${ip}`);
    if (!res.ok) return { country: null, signal: "ip-geolocation" };
    const body = await res.json();
    const country =
      body.success && typeof body.country_code === "string"
        ? body.country_code.toUpperCase()
        : null;
    return { country, signal: "ip-geolocation" };
  } catch {
    // Geolocation lookup failing shouldn't crash the request — callers
    // treat a null country as "not South Africa" (see requireSouthAfrica),
    // so this fails closed, not open.
    return { country: null, signal: "ip-geolocation" };
  }
}

export async function getRequestCountry(req: Request): Promise<string | null> {
  return (await getRequestLocation(req)).country;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return (forwarded.split(",")[0] ?? forwarded).trim();
  return req.headers.get("x-real-ip");
}

/** The message shown to a rejected applicant, and reused by the client-side eligibility banner — one string, not two that can drift apart. */
export const NOT_SOUTH_AFRICA_MESSAGE =
  "Baddies is currently open to South African creators only, no exceptions. Applications from outside South Africa can't be accepted.";
