import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatorCardRow } from "@/components/cards";
import { displayHeadingStyle } from "@/components/ui";
import { getCategoryCreators } from "@/lib/discovery/categories";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * SEO Phase 4: server-rendered, no more sign-in wall. This route's own
 * backing data (GET /api/discovery/categories/[slug], now delegating
 * to the same getCategoryCreators this page calls directly) never had
 * an auth check — the page itself was the only thing hiding it from a
 * signed-out visitor or crawler. No in-app link points here anymore
 * ("Discover by category" was removed from the UI), but the route
 * stays real and indexable for anyone who reaches it directly, and for
 * search engines via the sitemap.
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const category = await getCategoryCreators(params.slug);
  if (!category) {
    return { robots: { index: false, follow: false } };
  }
  const title = `${category.name} creators | baddies`;
  const description = `Discover ${category.name.toLowerCase()} creators on baddies — Africa's adult content network.`;
  return {
    title,
    description,
    alternates: { canonical: `/discovery/${category.slug}` },
    openGraph: { title, description },
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const category = await getCategoryCreators(params.slug);
  if (!category) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Discover", item: `${SITE_URL}/discovery` },
          {
            "@type": "ListItem",
            position: 3,
            name: category.name,
            item: `${SITE_URL}/discovery/${category.slug}`,
          },
        ],
      },
    ],
  };

  return (
    <main style={mainStyle}>
      {/* eslint-disable-next-line react/no-danger -- server-generated from already-public category fields only */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 style={displayHeadingStyle}>{category.name}</h1>
      {category.creators.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No verified creators in this category yet.</p>
      ) : (
        <CreatorCardRow creators={category.creators} />
      )}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };
