import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * Native Next.js file convention — generates /sitemap.xml.
 *
 * SEO Phase 2: only the static routes that exist and are indexable
 * today — the homepage and the 7 legal pages. Later SEO phases append
 * their own section here (verified creator profiles, category pages,
 * curated location pages) rather than rewriting this file, so each
 * section stays independently reviewable in its own commit.
 *
 * Deliberately a single sitemap rather than a sitemap index split
 * across multiple files/`generateSitemaps` — that split only earns its
 * complexity once a single file would need to enumerate tens of
 * thousands of URLs, which is far beyond this platform's realistic
 * scale for a long while. Revisit if/when this file's list would
 * genuinely approach that size, not before.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/creator-terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/content-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/age-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/dmca`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];

  return staticEntries;
}
