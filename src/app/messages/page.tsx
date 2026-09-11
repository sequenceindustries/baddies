"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { CardAvatar } from "@/components/cards";
import { ComposeMessageModal } from "@/components/post-card";
import { VerifiedBadge, displayHeadingStyle, useSession, SignInGate, SkeletonBlock } from "@/components/ui";

interface MessageableCreator {
  creatorProfileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isFoundingPartner: boolean;
  isFoundingBaddie: boolean;
}

/**
 * Messages tab launcher (social-feed redesign, Phase 4) — there's no
 * real inbox yet (explicit scope decision: a minimal real send, not a
 * thread-history UI — see the plan's Context section), so rather than
 * fake one, this is exactly what it looks like: the creators this fan
 * already follows or subscribes to, each opening the same
 * ComposeMessageModal the feed/profile pages already use. Honest about
 * what it is, not a placeholder pretending to be a real inbox.
 */
export default function MessagesPage() {
  const { user, loading } = useSession();
  const [creators, setCreators] = useState<MessageableCreator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageTarget, setMessageTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/messages/creators")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => setCreators(body.creators ?? []))
      .catch(() => setError("Couldn't load your creators."));
  }, [user]);

  if (loading) return <main style={mainStyle} />;
  if (!user) {
    return <SignInGate message="Create a free account or sign in to message creators." />;
  }

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Messages</h1>
      <p style={hintStyle}>
        A quick way to message creators you already follow or subscribe to — not a full inbox yet.
      </p>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {creators === null ? (
        <div style={listStyle}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} height="3.5rem" />
          ))}
        </div>
      ) : creators.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          Follow or subscribe to a creator to message them here.
        </p>
      ) : (
        <div style={listStyle}>
          {creators.map((c) => (
            <div key={c.creatorProfileId} style={rowStyle}>
              <Link href={`/creators/${c.creatorProfileId}`} style={rowLinkStyle}>
                <CardAvatar url={c.avatarUrl} initial={(c.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"} />
                <span style={nameStyle}>{c.displayName ?? "Unnamed creator"}</span>
                <VerifiedBadge isFoundingPartner={c.isFoundingPartner} isFoundingBaddie={c.isFoundingBaddie} />
              </Link>
              <button onClick={() => setMessageTarget(c.creatorProfileId)} style={messageButtonStyle}>
                Message
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {messageTarget && (
          <ComposeMessageModal key="compose" creatorProfileId={messageTarget} onClose={() => setMessageTarget(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem 4rem", maxWidth: "620px", margin: "0 auto" };

const hintStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "-0.5rem" };

const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.5rem" };

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0.75rem 1rem",
};

const rowLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.92rem",
  minWidth: 0,
};

const nameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const messageButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  flexShrink: 0,
};
