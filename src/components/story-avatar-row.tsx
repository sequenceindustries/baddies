"use client";

import { useEffect, useState } from "react";
import type { CreatorCardData } from "./cards";
import { PostDetailOverlay } from "./grid-thumbnail";

/**
 * "Stories" carousel (social-feed redesign, Phase 5 — the optional,
 * lowest-priority item per the brief, built last and kept deliberately
 * small). No ephemeral/expiring-content concept exists anywhere in this
 * app and none is invented here — "story" means recently-approved
 * creators, reusing the exact GET /api/discovery/new-creators query the
 * landing page's own "New Baddies" section already runs. A tap opens a
 * "quick preview": that creator's latest real teaser (their most recent
 * unlocked/FREE post specifically, not just their most recent post
 * overall — a locked VIP/Exclusive post would make a poor "preview" of
 * someone you don't follow yet, per direct follow-up feedback: "make
 * the stories functional and show teasers"), fetched from the already-
 * paginated GET /api/creators/:id/content (Phase 3) and handed to the
 * same PostDetailOverlay/PostCard Phase 2 built — zero new API routes,
 * `lock.locked` was already computed per item. Renders nothing at all
 * once there are no recently-approved creators, and degrades to doing
 * nothing on tap if a creator has no unlocked post on their first page
 * of content, rather than opening an overlay with nothing free to show.
 */
export function StoryAvatarRow() {
  const [creators, setCreators] = useState<CreatorCardData[] | null>(null);
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/new-creators")
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((body) => {
        if (!cancelled) setCreators(body.creators ?? []);
      })
      .catch(() => {
        if (!cancelled) setCreators([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPreview(creatorProfileId: string) {
    setLoadingId(creatorProfileId);
    try {
      const res = await fetch(`/api/creators/${creatorProfileId}/content`);
      const body = res.ok ? await res.json() : { items: [] };
      // The latest TEASER specifically — not just the latest post,
      // which is as likely to be a locked VIP/Exclusive item as not.
      const teaser = body.items?.find((i: { lock: { locked: boolean } }) => !i.lock.locked);
      if (teaser) setOpenContentId(teaser.contentId);
      // No unlocked post on this creator's first page — degrades to
      // doing nothing rather than opening an overlay with nothing free
      // to show.
    } finally {
      setLoadingId(null);
    }
  }

  if (creators === null || creators.length === 0) return null;

  return (
    <>
      <div className="story-row-scroll" style={rowStyle}>
        {creators.map((c) => (
          <button
            key={c.creatorProfileId}
            onClick={() => openPreview(c.creatorProfileId)}
            disabled={loadingId === c.creatorProfileId}
            style={itemStyle}
          >
            <span style={ringStyle}>
              <span style={avatarStyle}>
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt="" style={avatarImgStyle} />
                ) : (
                  (c.displayName ?? "?").trim().charAt(0).toUpperCase() || "?"
                )}
              </span>
            </span>
            <span style={nameStyle}>{c.displayName ?? "Unnamed"}</span>
          </button>
        ))}
      </div>

      {openContentId && <PostDetailOverlay contentId={openContentId} onClose={() => setOpenContentId(null)} />}
    </>
  );
}

// marginBottom widened per direct feedback ("more space between posts,
// especially between stories and first post") — this row sits directly
// above the feed's own post list, so it needed more separation than the
// general between-posts gap (feedListStyle's own 2.5rem), not less.
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.1rem",
  overflowX: "auto",
  padding: "0.25rem 0.1rem 0.35rem",
  marginBottom: "3rem",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.35rem",
  background: "none",
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
  width: "68px",
};

// The colored ring is the whole "story" signifier — a plain avatar with
// a gradient-ish accent border, Instagram convention, rather than any
// new visual language.
const ringStyle: React.CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "50%",
  padding: "2.5px",
  background: "linear-gradient(135deg, var(--accent), var(--accent-wine))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const avatarStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "2px solid var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  fontWeight: 600,
  fontSize: "1.1rem",
  color: "var(--accent)",
};

const avatarImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const nameStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "68px",
};
