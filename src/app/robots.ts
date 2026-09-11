import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * Native Next.js file convention — generates /robots.txt.
 *
 * Disallows every private/account/internal surface. Deliberately does
 * NOT disallow /login, /register, /verify-email, /partner-invite —
 * those are reachable pre-account for legitimate reasons (an invited
 * partner, an applicant, a fresh visitor have no session yet) and rely
 * on an explicit `noindex` meta tag instead (see the sibling layout.tsx
 * files added for the client-component ones, and login/page.tsx's own
 * metadata export). robots.txt disallow and noindex are NOT
 * interchangeable: a disallowed URL can still surface bare (no title/
 * snippet) in search results if linked externally, since a crawler
 * that never fetches a page can never see its noindex tag either — so
 * the two are applied together on those four pages as real
 * belt-and-suspenders, not redundant.
 *
 * Every entry below was cross-checked against the real route tree, not
 * copied from the original brief's suggested list verbatim — that list
 * named `(admin)`/`(partner)` as paths, which are Next.js route groups
 * stripped from the actual URL and would match nothing. The real path
 * behind `(partner)` is `/partner-dashboard`, included below.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/partner-dashboard",
        "/profile",
        "/settings",
        "/wallet",
        "/messages",
        "/dashboard",
        "/creator-dashboard",
        "/fan-home",
        "/fan-subscriptions",
        "/subscriptions",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
