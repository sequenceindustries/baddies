import type { MetadataRoute } from "next";
import { db } from "@/lib/db/client";
import { resolveCreatorCanonicalPath } from "@/lib/creator/public-profile";
import { LOCATIONS, getLocationCreators } from "@/lib/discovery/locations";
import { SITE_URL } from "@/lib/seo/site-url";

// Without this, Next statically generates sitemap.xml once at build
// time and never again — a new creator wouldn't appear until the next
// deploy, which fails "the sitemap must automatically update as new
// creators are added." force-dynamic makes this route re-query on
// every request, matching every other live-data route in this app.
export const dynamic = "force-dynamic";

/**
 * Native Next.js file convention — generates /sitemap.xml.
 *
 * SEO Phase 2 shipped the static routes (homepage + 7 legal pages).
 * Phase 3 appends every VERIFIED creator's profile below, using the
 * same canonical-path logic (handle-preferred) the profile page's own
 * `alternates.canonical` uses, so the sitemap and the page's own
 * canonical tag can never disagree about which URL is "the" one for a
 * given creator. Later phases (categories, curated locations) append
 * their own further sections the same way, rather than rewriting this
 * file.
 *
 * Deliberately a single sitemap rather than a sitemap index split
 * across multiple files/`generateSitemaps` — that split only earns its
 * complexity once a single file would need to enumerate tens of
 * thousands of URLs, which is far beyond this platform's realistic
 * scale for a long while. Revisit if/when this file's list would
 * genuinely approach that size, not before.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/discovery`, changeFrequency: "daily", priority: 0.8 },
    // SEO Phase 6 cross-check: a real, genuinely public marketing/
    // application page (already in middleware's PUBLIC_PATHS, reachable
    // pre-launch and pre-account) that Phase 2 missed from this list.
    { url: `${SITE_URL}/founding-baddies`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/creator-terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/content-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/age-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/dmca`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const verifiedCreators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED" },
    select: { id: true, handle: true, updatedAt: true },
  });
  const creatorEntries: MetadataRoute.Sitemap = verifiedCreators.map((creator) => ({
    url: `${SITE_URL}${resolveCreatorCanonicalPath({ creatorProfileId: creator.id, handle: creator.handle })}`,
    lastModified: creator.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  // SEO Phase 4: every admin-managed category is a real, indexable
  // page (src/app/discovery/[slug]/page.tsx) — no threshold gating
  // here the way curated locations will need (Phase 5): categories are
  // hand-created by an admin in the first place, so an empty one is
  // rare/temporary, not a structural risk of thin-page spam.
  const categories = await db.category.findMany({ select: { slug: true } });
  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${SITE_URL}/discovery/${category.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  // SEO Phase 5: a curated location is only listed here once it clears
  // its own indexability threshold — kept in agreement with that same
  // page's own generateMetadata robots.index value (both read the same
  // getLocationCreators result), so the sitemap never advertises a URL
  // Google would be told not to index if it followed the link anyway.
  const locationResults = await Promise.all(LOCATIONS.map((location) => getLocationCreators(location.slug)));
  const locationEntries: MetadataRoute.Sitemap = locationResults
    .filter((location): location is NonNullable<typeof location> => location !== null && location.indexable)
    .map((location) => ({
      url: `${SITE_URL}/locations/${location.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  return [...staticEntries, ...creatorEntries, ...categoryEntries, ...locationEntries];
}
