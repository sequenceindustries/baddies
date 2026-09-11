import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeedPage } from "@/lib/discovery/public-feed";
import { displayHeadingStyle } from "@/components/ui";
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
  const { items, nextCursor } = await getFeedPage({ scope: "discovery", viewer });

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Discover</h1>
      <DiscoveryClient initialItems={items} initialCursor={nextCursor} />
    </main>
  );
}

// 1320px = 1100px * 1.2 — widened 20% per direct follow-up feedback
// ("make the discovery columns 20% larger"). The grid itself is
// max-width: 100% of this <main> (see globals.css's .discovery-grid),
// so widening the container is what actually makes each of the still-4
// (still-3 on mobile) columns 20% wider, without changing column count.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "1320px", margin: "0 auto" };
