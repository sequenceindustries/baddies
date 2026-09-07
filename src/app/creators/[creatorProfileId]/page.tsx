"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VerifiedBadge, displayHeadingStyle, useSession, errorBannerStyle, SignInGate } from "@/components/ui";
import { ContentTimeline, ReportButton, type ContentCardData } from "@/components/cards";

interface CreatorProfileResponse {
  creatorProfileId: string;
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  country: string | null;
  city: string | null;
  verifiedBadge: true;
  vvipPriceUsd: number;
  unlimitedParticipant: boolean;
  followerCount: number;
  subscriberCount?: number;
  isLive: boolean;
}

interface RawContentItem {
  contentId: string;
  mediaType: ContentCardData["mediaType"];
  accessLevel: ContentCardData["accessLevel"];
  priceUsd: number | string | null;
  caption: string | null;
  publishedAt: string | null;
  likeCount?: number;
  viewerHasLiked?: boolean;
}

export default function CreatorProfilePage() {
  const params = useParams<{ creatorProfileId: string }>();
  const creatorProfileId = params.creatorProfileId;
  const { user, loading: sessionLoading } = useSession();

  const [creator, setCreator] = useState<CreatorProfileResponse | null>(null);
  const [items, setItems] = useState<RawContentItem[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    // Signed-out visitors are gated below (SignInGate) — don't even fetch
    // this creator's data for them.
    if (!user) return;
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
  }, [creatorProfileId, user]);

  if (sessionLoading) return <main style={mainStyle} />;
  if (!user) {
    return <SignInGate message="Create a free account or sign in to view this creator's profile." />;
  }

  async function toggleFollow() {
    setFollowBusy(true);
    const res = await fetch(`/api/creators/${creatorProfileId}/follow`, {
      method: following ? "DELETE" : "POST",
    });
    setFollowBusy(false);
    if (res.ok) {
      setFollowing((f) => !f);
      setCreator((c) => (c ? { ...c, followerCount: c.followerCount + (following ? -1 : 1) } : c));
    }
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
        <div style={headerTextBlockStyle}>
          <h1 style={{ ...displayHeadingStyle, marginBottom: "0.3rem" }}>
            {creator.displayName ?? "Unnamed creator"}
            {creator.isLive && <span style={liveNowBadgeStyle}>● LIVE NOW</span>}
          </h1>
          <VerifiedBadge />
          {(creator.city || creator.country) && (
            <p style={mutedStyle}>{[creator.city, creator.country].filter(Boolean).join(", ")}</p>
          )}
          {creator.bio && <p style={{ marginTop: "0.6rem" }}>{creator.bio}</p>}
          <div style={priceRowStyle}>
            <span>{creator.followerCount} followers</span>
            <span>Exclusive ${creator.vvipPriceUsd.toFixed(2)}/mo</span>
            {typeof creator.subscriberCount === "number" && <span>{creator.subscriberCount} subscribers</span>}
            {creator.unlimitedParticipant && <span>Included with VIP Pass</span>}
          </div>
        </div>
        {!isOwnProfile && user && (
          <div style={headerActionsStyle}>
            <button onClick={toggleFollow} disabled={followBusy} style={followButtonStyle(following)}>
              {following ? "Following" : "Follow"}
            </button>
            <div style={{ marginTop: "auto" }}>
              <ReportButton reportedUserId={creator.userId} />
            </div>
          </div>
        )}
      </div>

      {!isOwnProfile && user && (
        <SubscribeCard creatorProfileId={creatorProfileId} vvipPriceUsd={creator.vvipPriceUsd} />
      )}

      <h2 style={sectionHeadingStyle}>Content</h2>
      <ContentTimeline items={items} vvipPriceUsd={creator.vvipPriceUsd} />
    </main>
  );
}

/**
 * Dummy checkout UI — calls the stub-backed /api/checkout/* routes (see
 * their doc comments for why the stub path completes synchronously
 * instead of waiting on a payment webhook). No real money moves; this is
 * the flow real vendor integration would slot into once one is selected.
 */
function SubscribeCard({
  creatorProfileId,
  vvipPriceUsd,
}: {
  creatorProfileId: string;
  vvipPriceUsd: number;
}) {
  const [subscribed, setSubscribed] = useState(false);
  const [vipPassActive, setVipPassActive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribeVvip() {
    setBusy("vvip");
    setError(null);
    const res = await fetch("/api/checkout/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorProfileId }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Subscription failed.");
      return;
    }
    setSubscribed(true);
  }

  async function getVipPass() {
    setBusy("vip-pass");
    setError(null);
    const res = await fetch("/api/checkout/vip-pass", { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't get VIP pass.");
      return;
    }
    setVipPassActive(true);
  }

  return (
    <div style={checkoutCardStyle}>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={subscribeVvip}
          disabled={busy !== null || subscribed}
          style={checkoutButtonStyle(subscribed)}
        >
          {subscribed
            ? "✓ Subscribed (Exclusive)"
            : busy === "vvip"
              ? "..."
              : `Subscribe Exclusive $${vvipPriceUsd.toFixed(2)}/mo`}
        </button>
        <button onClick={getVipPass} disabled={busy !== null || vipPassActive} style={checkoutButtonStyle(vipPassActive)}>
          {vipPassActive ? "✓ VIP Pass active" : busy === "vip-pass" ? "..." : "Get platform VIP Pass"}
        </button>
      </div>
      <p style={{ ...mutedNoteStyle }}>
        Exclusive is this creator&apos;s own subscription — includes live videos on top of their
        subscriber-only posts. The VIP Pass is a separate, one-price platform-wide pass that unlocks
        VIP-tier content from every participating creator.
      </p>

      {error && <div style={{ ...errorBannerStyle, marginTop: "0.75rem", marginBottom: 0 }}>{error}</div>}
    </div>
  );
}

const checkoutCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "1rem 1.25rem",
  marginBottom: "2.5rem",
};

const mutedNoteStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  marginTop: "0.75rem",
  marginBottom: 0,
};

function checkoutButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1rem",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: active ? "default" : "pointer",
    background: active ? "var(--surface-raised)" : "var(--accent)",
    color: active ? "var(--text-muted)" : "var(--bg)",
    border: active ? "1px solid var(--border)" : "none",
  };
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const headerStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  alignItems: "stretch",
  marginBottom: "2.5rem",
  paddingBottom: "2rem",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
};

// Square (rounded, not a full circle) per feedback on this specific
// header — the small nav/card avatars elsewhere stay circular.
const avatarStyle: React.CSSProperties = {
  width: "96px",
  height: "96px",
  borderRadius: "16px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: "1.6rem",
  color: "var(--accent)",
  flexShrink: 0,
  overflow: "hidden",
};

// Overrides the app-wide `main { text-align: center }` rule — this
// header reads as a left-aligned identity block (avatar, name, bio),
// not centered page copy.
const headerTextBlockStyle: React.CSSProperties = { flex: 1, textAlign: "left" };

// Follow sits vertically centered in the header's height (justifyContent:
// center); Report gets marginTop: auto so it's pinned to the bottom
// regardless — a flex child's own margin: auto on the main axis wins
// over the container's justify-content for that one item.
const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: "0.5rem",
};

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", margin: "0.2rem 0" };

const liveNowBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  marginLeft: "0.75rem",
  background: "var(--danger)",
  color: "#fff",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.03em",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
};

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
    background: following ? "transparent" : "var(--accent)",
    color: following ? "var(--text)" : "var(--bg)",
    border: following ? "1px solid var(--border)" : "none",
  };
}
