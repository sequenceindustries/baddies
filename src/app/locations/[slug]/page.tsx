import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatorCardRow } from "@/components/cards";
import { displayHeadingStyle } from "@/components/ui";
import { getLocationCreators } from "@/lib/discovery/locations";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * SEO Phase 5 — new, curated location landing pages. See
 * src/lib/discovery/locations.ts for why this is a small hand-
 * maintained list rather than a page generated per arbitrary city
 * string. A location below its quality threshold still renders (a
 * real "new creators coming soon" state, never a 404) — only
 * `robots: { index: false }` changes, so it starts earning indexation
 * automatically the moment enough real creators match, no redeploy.
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const location = await getLocationCreators(params.slug);
  if (!location) {
    return { robots: { index: false, follow: false } };
  }
  const title = `${location.displayName} creators | baddies`;
  const description = `Discover verified creators from ${location.displayName} on baddies — Africa's adult content network.`;
  return {
    title,
    description,
    alternates: { canonical: `/locations/${location.slug}` },
    openGraph: { title, description },
    robots: location.indexable ? undefined : { index: false, follow: true },
  };
}

export default async function LocationPage({ params }: { params: { slug: string } }) {
  const location = await getLocationCreators(params.slug);
  if (!location) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Locations", item: `${SITE_URL}/discovery` },
          {
            "@type": "ListItem",
            position: 3,
            name: location.displayName,
            item: `${SITE_URL}/locations/${location.slug}`,
          },
        ],
      },
    ],
  };

  return (
    <main style={mainStyle}>
      {/* eslint-disable-next-line react/no-danger -- server-generated from already-public location/creator fields only */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 style={displayHeadingStyle}>{location.displayName}</h1>
      {location.creators.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          New creators from {location.displayName} are coming soon — check back before long.
        </p>
      ) : (
        <CreatorCardRow creators={location.creators} />
      )}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };
