import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPublicCreatorProfile, resolveCreatorCanonicalPath } from "@/lib/creator/public-profile";
import { getCreatorPublicContentPage } from "@/lib/creator/public-content";
import { SITE_URL } from "@/lib/seo/site-url";
import { CreatorProfileClient } from "./CreatorProfileClient";

const META_DESCRIPTION_LIMIT = 160;
function truncateForMeta(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

/**
 * SEO Phase 3: real per-creator metadata, generated from the exact same
 * public-safe data the page itself renders (getPublicCreatorProfile) —
 * never a separate, possibly-drifting source. A creator without a
 * handle still gets correct metadata; `alternates.canonical` always
 * prefers the handle URL once one exists (see
 * resolveCreatorCanonicalPath's own doc comment for why both URL forms
 * stay permanently valid, with canonical only signaling the preferred
 * one — no redirect).
 */
export async function generateMetadata({
  params,
}: {
  params: { creatorProfileId: string };
}): Promise<Metadata> {
  const creator = await getPublicCreatorProfile(params.creatorProfileId);

  if (!creator) {
    // Defense-in-depth: notFound() below already sends a real HTTP 404
    // for this same case, but a stale cache or a crawler that ignores
    // the status code shouldn't index whatever this metadata describes.
    return { robots: { index: false, follow: false } };
  }

  const name = creator.displayName ?? "Creator";
  const title = creator.handle ? `${name} (@${creator.handle}) | baddies` : `${name} | baddies`;
  const description = creator.bio
    ? truncateForMeta(creator.bio, META_DESCRIPTION_LIMIT)
    : `${name}'s verified creator profile on baddies — Africa's adult content network.`;
  const canonicalPath = resolveCreatorCanonicalPath(creator);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type: "profile",
      images: creator.avatarUrl ? [creator.avatarUrl] : undefined,
    },
    twitter: {
      card: creator.avatarUrl ? "summary" : "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CreatorProfilePage({
  params,
}: {
  params: { creatorProfileId: string };
}) {
  const [creator, viewer] = await Promise.all([
    getPublicCreatorProfile(params.creatorProfileId),
    getCurrentUser(),
  ]);

  if (!creator) {
    notFound();
  }

  // SEO Phase 4: the first content page is now server-rendered too —
  // real, unique, crawlable caption text per creator instead of a bare
  // shell. Never a media URL either way (see getCreatorPublicContentPage's
  // own doc comment) — `viewer` being null (anonymous/crawler) is
  // already a safe, supported case, not a new one.
  const contentPage = await getCreatorPublicContentPage({ creatorProfileId: creator.creatorProfileId, viewer });

  const canonicalPath = resolveCreatorCanonicalPath(creator);
  const name = creator.displayName ?? "Creator";

  // ProfilePage + Person (public fields only — stage name, never legal
  // name; avatar; bio when set) + BreadcrumbList, matching exactly what
  // this page already renders for every visitor, real or crawler.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${SITE_URL}${canonicalPath}#profilepage`,
        url: `${SITE_URL}${canonicalPath}`,
        mainEntity: { "@id": `${SITE_URL}${canonicalPath}#person` },
      },
      {
        "@type": "Person",
        "@id": `${SITE_URL}${canonicalPath}#person`,
        name,
        ...(creator.handle ? { alternateName: `@${creator.handle}` } : {}),
        ...(creator.bio ? { description: creator.bio } : {}),
        ...(creator.avatarUrl ? { image: creator.avatarUrl } : {}),
        url: `${SITE_URL}${canonicalPath}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${canonicalPath}` },
        ],
      },
    ],
  };

  return (
    <main style={mainStyle}>
      {/* eslint-disable-next-line react/no-danger -- server-generated from already-public creator fields only, never raw user HTML */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CreatorProfileClient
        creatorProfileId={creator.creatorProfileId}
        initialCreator={creator}
        initialItems={contentPage?.items ?? []}
        initialCursor={contentPage?.nextCursor ?? null}
      />
    </main>
  );
}

// Matches the previous client page's own mainStyle exactly — visual
// output is unchanged by this SSR conversion.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "620px", margin: "0 auto" };
