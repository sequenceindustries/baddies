"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VerifiedBadge, displayHeadingStyle, useSession, inputStyle, errorBannerStyle } from "@/components/ui";
import { ContentGrid, ReportButton, type ContentCardData } from "@/components/cards";

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
        <div style={{ flex: 1 }}>
          <h1 style={{ ...displayHeadingStyle, marginBottom: "0.3rem" }}>
            {creator.displayName ?? "Unnamed creator"}
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
            <button onClick={toggleFollow} disabled={followBusy} style={followButtonStyle(following)}>
              {following ? "Following" : "Follow"}
            </button>
            <ReportButton reportedUserId={creator.userId} />
          </div>
        )}
      </div>

      {!isOwnProfile && user && (
        <SubscribeAndTip creatorProfileId={creatorProfileId} vvipPriceUsd={creator.vvipPriceUsd} />
      )}

      <ContentByTier items={items} vvipPriceUsd={creator.vvipPriceUsd} />
    </main>
  );
}

/**
 * OnlyFans-style content grouping: separate Free/VIP/Exclusive sections
 * rather than one undifferentiated grid, so a visitor can see at a
 * glance what's actually free vs. what needs the platform VIP Pass vs.
 * what needs a subscription to this specific creator — with that price
 * shown right on the section header.
 */
function ContentByTier({ items, vvipPriceUsd }: { items: RawContentItem[]; vvipPriceUsd: number }) {
  const free = items.filter((i) => i.accessLevel === "FREE");
  const vip = items.filter((i) => i.accessLevel === "VIP");
  const exclusive = items.filter((i) => i.accessLevel === "VVIP");

  if (items.length === 0) {
    return (
      <>
        <h2 style={sectionHeadingStyle}>Content</h2>
        <p style={{ color: "var(--text-muted)" }}>No content yet.</p>
      </>
    );
  }

  return (
    <>
      {free.length > 0 && (
        <section style={{ marginBottom: "2.25rem" }}>
          <h2 style={sectionHeadingStyle}>Free</h2>
          <ContentGrid items={free} />
        </section>
      )}
      {vip.length > 0 && (
        <section style={{ marginBottom: "2.25rem" }}>
          <h2 style={sectionHeadingStyle}>VIP</h2>
          <ContentGrid items={vip} />
        </section>
      )}
      {exclusive.length > 0 && (
        <section style={{ marginBottom: "2.25rem" }}>
          <h2 style={sectionHeadingStyle}>Exclusive · ${vvipPriceUsd.toFixed(2)}/mo</h2>
          <ContentGrid items={exclusive} />
        </section>
      )}
    </>
  );
}

/**
 * Dummy checkout UI — calls the stub-backed /api/checkout/* routes (see
 * their doc comments for why the stub path completes synchronously
 * instead of waiting on a payment webhook). No real money moves; this is
 * the flow real vendor integration would slot into once one is selected.
 */
function SubscribeAndTip({ creatorProfileId, vvipPriceUsd }: { creatorProfileId: string; vvipPriceUsd: number }) {
  const [subscribed, setSubscribed] = useState(false);
  const [vipPassActive, setVipPassActive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [tipAmount, setTipAmount] = useState("5.00");
  const [tipMessage, setTipMessage] = useState("");
  const [tipSent, setTipSent] = useState(false);

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

  async function sendTip(e: React.FormEvent) {
    e.preventDefault();
    setBusy("tip");
    setError(null);
    const res = await fetch("/api/checkout/tip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatorProfileId,
        amountUsd: Number(tipAmount),
        message: tipMessage || undefined,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Tip failed.");
      return;
    }
    setTipSent(true);
    setTipMessage("");
    setShowTip(false);
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
        <button onClick={() => setShowTip((v) => !v)} style={ghostCheckoutButtonStyle}>
          {tipSent ? "✓ Tip sent — send another?" : "Send a tip"}
        </button>
      </div>
      <p style={{ ...mutedNoteStyle }}>
        Exclusive is this creator&apos;s own subscription. The VIP Pass is one platform-wide price that unlocks
        VIP-tier content from every participating creator.
      </p>

      {showTip && (
        <form onSubmit={sendTip} style={tipFormStyle}>
          <input
            style={{ ...inputStyle, width: "110px", marginTop: 0 }}
            type="number"
            min="1"
            step="0.5"
            value={tipAmount}
            onChange={(e) => setTipAmount(e.target.value)}
            aria-label="Tip amount (USD)"
          />
          <input
            style={{ ...inputStyle, flex: 1, marginTop: 0 }}
            placeholder="Optional message"
            value={tipMessage}
            onChange={(e) => setTipMessage(e.target.value)}
            maxLength={500}
          />
          <button type="submit" disabled={busy === "tip"} style={checkoutButtonStyle(false)}>
            {busy === "tip" ? "..." : "Send"}
          </button>
        </form>
      )}

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

const tipFormStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  marginTop: "0.85rem",
  alignItems: "center",
};

function checkoutButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1rem",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: active ? "default" : "pointer",
    background: active ? "var(--surface-raised)" : "var(--accent-gold)",
    color: active ? "var(--text-muted)" : "var(--bg)",
    border: active ? "1px solid var(--border)" : "none",
  };
}

const ghostCheckoutButtonStyle: React.CSSProperties = {
  padding: "0.55rem 1rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
};

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
