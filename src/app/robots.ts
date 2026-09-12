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
 *
 * SEO Phase 6 cross-check against every top-level route folder added
 * two real, distinct gaps:
 *   - `/apply` — a signed-in creator's private application/identity-
 *     verification flow, same privacy class as /settings or /wallet.
 *   - `/feed` — NOT private (its GET /api/feed already tolerates a
 *     signed-out viewer), but it's still a "use client" page with no
 *     server-rendered content, unlike /discovery after this project's
 *     Phase 4 conversion — a crawler visiting it today gets an empty
 *     shell either way, so disallowing it avoids wasting crawl budget
 *     until (if) it gets the same SSR treatment. A genuine future SEO
 *     opportunity, not a privacy decision — revisit this entry if that
 *     conversion ever happens.
 * `/home`, `/search`, `/dashboard`, `/creator-dashboard`, `/fan-home`,
 * `/subscriptions` need no entry here at all — Phase 6 also converted
 * every one of them from a client-side-only redirect (a "use client"
 * page.tsx stub) into a real, framework-level 308 via `redirects()` in
 * next.config.js (see that file's own doc comment for why: page-level
 * `redirect()`/`permanentRedirect()` from "next/navigation" turned out
 * to have a reproducible bug in this exact Next.js version that never
 * produces a real top-level HTTP redirect). A crawler now gets
 * redirected immediately to whatever real, already-classified page
 * each one points at, rather than rendering blank content of its own
 * to potentially disallow.
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
        "/apply",
        "/feed",
        // Dev-only stub-payment-provider confirmation page (monetisation
        // redesign) — hard-blocked server-side outside
        // PAYMENT_PROVIDER=stub, but disallowed here too on the same
        // belt-and-suspenders logic as the rest of this list.
        "/checkout",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
