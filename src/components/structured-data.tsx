import { SITE_URL } from "@/lib/seo/site-url";

/**
 * Site-wide Organization + WebSite JSON-LD (schema.org), rendered once
 * from the root layout — a Server Component, so this needs no client
 * boundary of its own. Describes only real, already-public information
 * (the site's own name/URL/logo) — never fabricated ratings, reviews,
 * or counts.
 *
 * Deliberately no `SearchAction`: /discovery's search box (the site's
 * real search feature) is a plain in-page form today with no `?q=`
 * URL param support (confirmed by reading src/app/discovery/page.tsx —
 * the query only ever lives in local component state, submitted via
 * fetch, never reflected in the address bar). Advertising a
 * `SearchAction` target that doesn't actually work from a URL would be
 * structured data describing a capability the page doesn't have. Add
 * this once /discovery genuinely supports a `?q=` deep link (tracked
 * alongside that page's own SEO conversion).
 */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "baddies",
        url: SITE_URL,
        logo: `${SITE_URL}/apple-icon.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "baddies",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    // eslint-disable-next-line react/no-danger -- static, non-user-input JSON-LD only
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
