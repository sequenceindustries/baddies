"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VerifiedBadge, displayHeadingStyle, useSession } from "@/components/ui";
import { ContentGrid, type ContentCardData } from "@/components/cards";

interface CreatorProfileResponse {
  creatorProfileId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  country: string | null;
  verifiedBadge: true;
  entryPriceUsd: number;
  vipPriceUsd: number;
  unlimitedParticipant: boolean;
  subscriberCount?: number;
}

interface RawContentItem {
  contentId: string;
  mediaType: ContentCardData["mediaType"];
  accessLevel: ContentCardData["accessLevel"];
  priceUsd: number | string | null;
  caption: string | null;
  publishedAt: string | null;
}

export default function CreatorProfilePage() {
  const params = useParams<{ creatorProfileId: string }>();
  const creatorProfileId = params.creatorProfileId;
  const { user } = useSession();

  const [creator, setCreator] = useState<CreatorProfileResponse | null>(null);
  const [items, setItems] = useState<RawContentItem[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/creators/${creatorProfileId}`)
      .then((r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled && body) setCreator(body);
      });

    fetch(`/api/creators/${creatorProfileId}/content`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((body) => {
        if (!cancelled) setItems(body.items ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [creatorProfileId]);

  async function toggleFollow() {
    setFollowBusy(true);
    const res = await fetch(`/api/creators/${creatorProfileId}/follow`, {
      method: following ? "DELETE" : "POST",
    });
    setFollowBusy(false);
    if (res.ok) setFollowing((f) => !f);
  }

  if (notFound) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Creator not found</h1>
        <p style={{ color: "var(--text-muted)" }}>This creator doesn&apos;t exist or isn&apos;t verified yet.</p>
      </main>
    );
  }

  if (!creator) {
    return (
      <main style={mainStyle}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </main>
    );
  }

  const initial = (creator.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const isOwnProfile = user?.creatorProfile?.id === creatorProfileId;

  return (
    <main style={mainStyle}>
      <div style={headerStyle}>
        <div style={avatarStyle}>
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initial
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ ...displayHeadingStyle, marginBottom: "0.3rem" }}>
            {creator.displayName ?? "Unnamed creator"}
          </h1>
          <VerifiedBadge />
          {creator.country && <p style={mutedStyle}>{creator.country}</p>}
          {creator.bio && <p style={{ marginTop: "0.6rem" }}>{creator.bio}</p>}
          <div style={priceRowStyle}>
            <span>Entry ${creator.entryPriceUsd.toFixed(2)}/mo</span>
            <span>VIP ${creator.vipPriceUsd.toFixed(2)}/mo</span>
            {typeof creator.subscriberCount === "number" && <span>{creator.subscriberCount} subscribers</span>}
          </div>
        </div>
        {!isOwnProfile && user && (
          <button onClick={toggleFollow} disabled={followBusy} style={followButtonStyle(following)}>
            {following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      <h2 style={sectionHeadingStyle}>Content</h2>
      <ContentGrid items={items} />
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const headerStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  alignItems: "flex-start",
  marginBottom: "2.5rem",
  paddingBottom: "2rem",
  borderBottom: "1px solid var(--border)",
};

const avatarStyle: React.CSSProperties = {
  width: "84px",
  height: "84px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: "1.6rem",
  color: "var(--accent-gold)",
  flexShrink: 0,
  overflow: "hidden",
};

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", margin: "0.2rem 0" };

const priceRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  marginTop: "0.75rem",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1rem",
};

function followButtonStyle(following: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1.1rem",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    flexShrink: 0,
    background: following ? "transparent" : "var(--accent-gold)",
    color: following ? "var(--text)" : "var(--bg)",
    border: following ? "1px solid var(--border)" : "none",
  };
}
