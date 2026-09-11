/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Media is always served via signed URLs from the storage provider, so
  // no image domains need to be allow-listed at build time for user
  // content (see src/lib/providers/storage).

  // Don't advertise the framework in every response — pure
  // information-disclosure hardening, no functional effect.
  poweredByHeader: false,

  // Baseline security headers, applied to every response. The TLS
  // certificate itself was already confirmed valid (Let's Encrypt,
  // correct domain, HTTP->HTTPS redirect already working) — these don't
  // fix a broken certificate, but their absence is exactly what trips
  // security-scanner browser extensions and header-grading tools (e.g.
  // securityheaders.com) into flagging a page as "not secure" even over
  // a perfectly valid HTTPS connection.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Tells browsers to only ever contact this domain (and every
          // subdomain) over HTTPS for the next two years, even if a user
          // later types a bare "http://" URL — closes the one real gap
          // a valid cert alone doesn't: the *first* request before any
          // redirect happens. Deliberately NOT adding `preload` here —
          // submitting to browsers' built-in preload list is very hard
          // to reverse (can take months to unwind across shipped
          // browser versions), so that's a separate decision to make
          // deliberately later, not a default to switch on silently.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Stops a browser from ever guessing a response's content
          // type differently than what the server declared — closes off
          // a class of content-sniffing XSS.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No part of this app is meant to be framed by another site —
          // straightforward clickjacking protection.
          { key: "X-Frame-Options", value: "DENY" },
          // Sends the full referrer to same-origin navigations (fine,
          // useful for internal analytics) but only the origin — never
          // the full path/query, which could leak application IDs, etc.
          // — to a different origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Explicit allow/deny list rather than leaving browser
          // defaults implicit. `geolocation=(self)` matches real usage
          // (the register page's location-detect button, see
          // src/components/ui.tsx). `camera=(self)` matches the other
          // real usage this policy was blocking outright until now: the
          // live selfie-holding-ID and liveness-video capture on /apply
          // and the creator dashboard (src/components/verification-
          // capture.tsx) call getUserMedia directly — a blanket
          // `camera=()` disables `navigator.mediaDevices` entirely,
          // which is a stricter block than any per-site browser
          // permission and can't be worked around by allowing the site
          // in Chrome's own settings. Microphone/payment stay blocked;
          // the liveness capture is explicitly `audio: false`.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), payment=(), geolocation=(self)",
          },
        ],
      },
    ];
  },

  // SEO Phase 6: 6 renamed routes from earlier in this app's history
  // (/home, /search, /dashboard, /subscriptions, /fan-home, /creator-
  // dashboard) used to be "use client" pages that only redirected
  // inside a useEffect — a crawler, or anything not executing JS, saw
  // a blank page with no real HTTP redirect at all. The obvious fix —
  // a page.tsx calling `redirect()`/`permanentRedirect()` from
  // "next/navigation" — turned out to have a reproducible bug in this
  // exact Next.js 14.2.35 setup: the redirect digest gets embedded in
  // the RSC payload as a hydration-time signal instead of ever being
  // converted into a real top-level HTTP 3xx response, confirmed via
  // curl/fetch against both `next dev` and a real `next start` build
  // (not a dev-only quirk). This `redirects()` config is the standard,
  // documented, framework-level mechanism for exactly this situation —
  // Next resolves it before ever looking for a matching page component,
  // so it reliably produces a real redirect (permanent: true → 308) for
  // every client (crawler, curl, or a real browser) — and it's what
  // real-world Next apps use for renamed routes in the first place, not
  // a workaround. The now-unnecessary page.tsx stubs at all 6 old paths
  // were deleted.
  async redirects() {
    return [
      { source: "/home", destination: "/feed", permanent: true },
      { source: "/search", destination: "/discovery", permanent: true },
      { source: "/dashboard", destination: "/profile", permanent: true },
      { source: "/subscriptions", destination: "/fan-subscriptions", permanent: true },
      { source: "/fan-home", destination: "/feed", permanent: true },
      { source: "/creator-dashboard", destination: "/profile", permanent: true },
    ];
  },
};

module.exports = nextConfig;
