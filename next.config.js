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
          // src/components/ui.tsx) — camera/microphone/payment are
          // blocked outright since nothing in this app uses them.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
