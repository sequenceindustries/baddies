import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeedPage } from "@/lib/discovery/public-feed";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { resolveCreatorCanonicalPath } from "@/lib/creator/public-profile";
import { displayHeadingStyle } from "@/components/ui";
import { CreatorCardRow } from "@/components/cards";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";
import { DiscoveryClient } from "./DiscoveryClient";

export const metadata: Metadata = {
  title: "Discover creators | baddies",
  description:
    "Browse public previews from every verified creator on baddies — Africa's adult content network. No cost, no card required.",
  alternates: { canonical: "/discovery" },
};

/**
 * SEO Phase 4: server-rendered first page, no more sign-in wall. The
 * grid was always fed by GET /api/feed?scope=discovery, a route with
 * no hard auth check (viewer may be null throughout) — the page itself
 * was the only thing hiding real, unlocked post content from a
 * signed-out visitor or crawler. Search box + pagination + the
 * click-to-open overlay stay client-side (DiscoveryClient) — none of
 * that needs to exist before hydration for a crawler's purposes, the
 * grid's real content does.
 */
export default async function DiscoveryPage() {
  const viewer = await getCurrentUser();
  const categoriesQuery = db.category.findMany({
    where: { creators: { some: { creatorProfile: { status: "VERIFIED" } } } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  // Signed out: profile previews only — each creator's feature image and
  // profile picture (toCreatorCard never uses a post). No posts, teasers
  // or captions until the visitor signs in; getFeedPage and
  // canAccessContent enforce the same rule server-side.
  if (!viewer) {
    const [categories, creators] = await Promise.all([
      categoriesQuery,
      db.creatorProfile.findMany({
        where: { status: "VERIFIED" },
        select: CREATOR_CARD_SELECT,
        orderBy: { approvedAt: "desc" },
        take: 60,
      }),
    ]);
    const cards = await Promise.all(creators.map(toCreatorCard));
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Discover</h1>
        <p style={introStyle}>
          Verified South African creators on baddies. Sign in or join free to see their posts and teasers.
        </p>
        <div style={ctaRowStyle}>
          <Link href="/register" style={joinButtonStyle}>
            Join
          </Link>
          <Link href="/login" style={signInButtonStyle}>
            Sign In
          </Link>
        </div>
        {categories.length > 0 && (
          <nav aria-label="Browse by category" style={chipRowStyle}>
            {categories.map((c) => (
              <Link key={c.slug} href={`/discovery/${c.slug}`} style={chipStyle}>
                {c.name}
              </Link>
            ))}
          </nav>
        )}
        {cards.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No verified creators yet.</p>
        ) : (
          <CreatorCardRow creators={cards} />
        )}
      </main>
    );
  }

  const [{ items, nextCursor }, categories, creators] = await Promise.all([
    getFeedPage({ scope: "discovery", viewer }),
    categoriesQuery,
    db.creatorProfile.findMany({
      where: { status: "VERIFIED" },
      select: { id: true, handle: true, user: { select: { profile: { select: { displayName: true } } } } },
      orderBy: { approvedAt: "desc" },
      take: 60,
    }),
  ]);

  // The grid itself is image-only and fills in client-side, so on its own
  // the page read as empty to search engines ("Soft 404"). These
  // server-rendered sections give it real text and crawlable links to
  // every category and verified creator — useful navigation for people
  // too.
  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Discover</h1>
      <p style={introStyle}>
        Free previews from verified South African creators on baddies. Tap any post to view it, or open a creator&apos;s
        profile to see more — subscribe for VIP and Exclusive content.
      </p>
      {categories.length > 0 && (
        <nav aria-label="Browse by category" style={chipRowStyle}>
          {categories.map((c) => (
            <Link key={c.slug} href={`/discovery/${c.slug}`} style={chipStyle}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      <DiscoveryClient initialItems={items} initialCursor={nextCursor} />
      {creators.length > 0 && (
        <section style={creatorsSectionStyle} aria-labelledby="discover-creators-heading">
          <h2 id="discover-creators-heading" style={sectionHeadingStyle}>
            Creators on baddies
          </h2>
          <div style={chipRowStyle}>
            {creators.map((c) => (
              <Link
                key={c.id}
                href={resolveCreatorCanonicalPath({ creatorProfileId: c.id, handle: c.handle })}
                style={chipStyle}
              >
                {c.user.profile?.displayName ?? "Creator"}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// 1320px = 1100px * 1.2 — widened 20% per direct follow-up feedback
// ("make the discovery columns 20% larger"). The grid itself is
// max-width: 100% of this <main> (see globals.css's .discovery-grid),
// so widening the container is what actually makes each of the still-4
// (still-3 on mobile) columns 20% wider, without changing column count.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "1320px", margin: "0 auto" };

const introStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.6,
  maxWidth: "640px",
  margin: "-0.25rem auto 1.25rem",
};

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.5rem",
  marginBottom: "1.25rem",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "36px",
  padding: "0 0.9rem",
  borderRadius: "999px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: "0.85rem",
  textDecoration: "none",
};

const ctaRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "0.6rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
};

// Local, not spread from ui.tsx's primaryButtonStyle: this is a server
// component and ui.tsx a client module, so its exports are client
// references here and spreading one yields nothing.
const joinButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.7rem 1.6rem",
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "1px solid transparent",
  borderRadius: "999px",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
};

const signInButtonStyle: React.CSSProperties = {
  ...joinButtonStyle,
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
};

const creatorsSectionStyle: React.CSSProperties = { marginTop: "2.5rem" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.1rem",
  fontWeight: 700,
  margin: "0 0 0.9rem",
};
