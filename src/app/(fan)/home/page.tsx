"use client";

import { useEffect, useState } from "react";
import { CreatorCardRow, ContentGrid, type CreatorCardData, type ContentCardData } from "@/components/cards";
import { HowItWorks } from "@/components/how-it-works";

interface RawContentItem {
  id?: string;
  contentId?: string;
  accessLevel: ContentCardData["accessLevel"];
  priceUsd?: number | string | null;
  caption?: string | null;
  publishedAt?: string | null;
  mediaType?: ContentCardData["mediaType"];
  creatorProfileId?: string | null;
  creatorDisplayName?: string | null;
  creatorAvatarUrl?: string | null;
}

interface HomeResponse {
  following: RawContentItem[];
  subscribed: RawContentItem[];
  vipContent: RawContentItem[];
  unlimited: CreatorCardData[];
  nearby: CreatorCardData[];
  trending: RawContentItem[];
  newCreators: CreatorCardData[];
}

function normalize(items: RawContentItem[]): ContentCardData[] {
  return items
    .filter((i) => i.id ?? i.contentId)
    .map((i) => ({
      contentId: (i.id ?? i.contentId) as string,
      accessLevel: i.accessLevel,
      priceUsd: i.priceUsd,
      caption: i.caption,
      publishedAt: i.publishedAt,
      mediaType: i.mediaType,
      creatorProfileId: i.creatorProfileId,
      creatorDisplayName: i.creatorDisplayName,
      creatorAvatarUrl: i.creatorAvatarUrl,
    }));
}

export default function FanHomePage() {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vipPassActive, setVipPassActive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/home")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load home feed.");
        return r.json();
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your feed. Try refreshing.");
      });

    fetch("/api/fan/subscriptions")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setVipPassActive(body.vipPass?.status === "ACTIVE");
      })
      .catch(() => {
        /* not signed in as a fan, or request failed — just hide the banner */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={mainStyle}>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!data && !error && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}

      {vipPassActive === false && <VipPassBanner />}

      {data && (
        <>
          {normalize(data.following).length > 0 && (
            <section style={sectionWrapStyle}>
              <h2 style={sectionHeadingStyle}>Following</h2>
              <ContentGrid items={normalize(data.following)} />
            </section>
          )}

          {normalize(data.subscribed).length > 0 && (
            <section style={sectionWrapStyle}>
              <h2 style={sectionHeadingStyle}>Your Exclusives</h2>
              <ContentGrid items={normalize(data.subscribed)} />
            </section>
          )}

          {normalize(data.vipContent).length > 0 && (
            <section style={sectionWrapStyle}>
              <h2 style={sectionHeadingStyle}>VIP Content</h2>
              <ContentGrid items={normalize(data.vipContent)} />
            </section>
          )}

          <CreatorCardRow title="Baddies Near You" creators={data.nearby} />
          <CreatorCardRow title="New Baddies" creators={data.newCreators} />

          {normalize(data.trending).length > 0 && (
            <section style={sectionWrapStyle}>
              <h2 style={sectionHeadingStyle}>Trending</h2>
              <ContentGrid items={normalize(data.trending)} />
            </section>
          )}

          {normalize(data.following).length === 0 &&
            normalize(data.subscribed).length === 0 &&
            normalize(data.vipContent).length === 0 &&
            data.nearby.length === 0 &&
            normalize(data.trending).length === 0 &&
            data.newCreators.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>
                Nothing here yet — once creators publish content, it&apos;ll show up here.
              </p>
            )}
        </>
      )}

      <HowItWorks />
    </main>
  );
}

/**
 * Promotes the platform-wide VIP Pass (see prisma/schema.prisma's
 * ContentAccessLevel comment) — one price, unlocks VIP-tier content from
 * every participating creator. Only rendered once we know the fan
 * doesn't already have an active one (vipPassActive === false, not just
 * falsy/loading).
 */
function VipPassBanner() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getVipPass() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout/vip-pass", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't get VIP pass.");
      return;
    }
    setDone(true);
  }

  return (
    <div style={bannerStyle}>
      <div>
        <div style={{ fontWeight: 600 }}>
          {done ? "✓ VIP Pass active" : "Get the platform VIP Pass"}
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
          {done
            ? "You now have VIP-tier content from every participating creator."
            : "One price unlocks VIP-tier content from every participating creator."}
        </div>
        {error && <div style={{ fontSize: "0.8rem", color: "var(--danger)", marginTop: "0.4rem" }}>{error}</div>}
      </div>
      {!done && (
        <button onClick={getVipPass} disabled={busy} style={bannerButtonStyle}>
          {busy ? "..." : "Get VIP Pass"}
        </button>
      )}
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--accent-gold)",
  borderRadius: "12px",
  padding: "1.1rem 1.4rem",
  marginBottom: "2.25rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const bannerButtonStyle: React.CSSProperties = {
  background: "var(--accent-gold)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  flexShrink: 0,
};

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

// Clearly-separated categories rather than sections running straight
// into each other — this page stacks a lot of them.
const sectionWrapStyle: React.CSSProperties = { marginBottom: "4rem" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 0.85rem",
};
