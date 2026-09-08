"use client";

import { useEffect, useState } from "react";
import {
  useSession,
  displayHeadingStyle,
  cardStyle,
  Field,
  inputStyle,
  checkboxRowStyle,
  primaryButtonStyle,
  errorBannerStyle,
  ImageUploadField,
} from "@/components/ui";
import { VerificationFlow } from "@/components/verification-capture";
import { ACCESS_LABEL } from "@/components/cards";

type CreatorStatus =
  | "PENDING"
  | "VERIFICATION_REQUIRED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "SUSPENDED"
  | "REJECTED"
  | "BANNED";

// FREE/VIP/VVIP — see prisma/schema.prisma's ContentAccessLevel comment.
type AccessLevel = "FREE" | "VIP" | "VVIP";

interface OwnContentItem {
  contentId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO";
  accessLevel: AccessLevel;
  priceUsd: string | number | null;
  caption: string | null;
  status: string;
  moderationStatus: string;
  publishedAt: string | null;
  createdAt: string;
  likeCount: number;
}

type DashboardTab = "overview" | "content" | "settings";

export default function CreatorDashboardPage() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState<DashboardTab>("overview");

  if (loading) return <main style={mainStyle} />;

  if (!user) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
      </main>
    );
  }

  if (!user.creatorProfile) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Creator Dashboard</h1>
        <p style={{ color: "var(--text-muted)" }}>You haven&apos;t applied to become a creator yet.</p>
      </main>
    );
  }

  const status = user.creatorProfile.status as CreatorStatus;
  const active = status !== "REJECTED" && status !== "BANNED";

  // Account (identity summary + Settings link) now lives in the nav's
  // account menu instead of a dashboard tab — see AccountMenu in
  // components/ui.tsx.
  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "content", label: "Content" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Creator Dashboard</h1>
      <StatusPanel status={status} />

      {active && (
        <>
          <div style={tabBarStyle}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={tabButtonStyle(tab === t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <OnboardingChecklist />
              <StatsPanel />
              <WalletPanel />
            </>
          )}
          {tab === "content" && <ContentPanel />}
          {tab === "settings" && <CreatorSettingsPanel />}
        </>
      )}
    </main>
  );
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginBottom: "1.75rem",
  flexWrap: "wrap",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.5rem 1.1rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--bg)" : "var(--text-muted)",
    border: active ? "none" : "1px solid var(--border)",
  };
}

interface WalletBalances {
  pendingBalanceUsd: number;
  availableBalanceUsd: number;
  paidBalanceUsd: number;
}

/**
 * Read-model display — balances are derived from LedgerEntry history by
 * src/lib/ledger/service.ts#recomputeWalletBalances, recomputed on every
 * dummy checkout (see src/app/api/checkout/*) and every payout approval.
 */
/**
 * Phase 4's onboarding checklist — reuses three endpoints the rest of
 * the dashboard already calls (no new backend needed): /api/profile for
 * the picture/bio, /api/creator/settings for the featured image, and
 * /api/creator/content for whether each tier has at least one post.
 * Purely a progress nudge, not a gate — a creator can ignore it and
 * everything else in the dashboard still works.
 */
function OnboardingChecklist() {
  const [items, setItems] = useState<{ label: string; done: boolean }[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/creator/settings").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/creator/content").then((r) => (r.ok ? r.json() : { items: [] })),
    ]).then(([profile, settings, content]) => {
      const tiers = new Set((content?.items ?? []).map((i: OwnContentItem) => i.accessLevel));
      setItems([
        { label: "Profile picture", done: Boolean(profile?.avatarUrl) },
        { label: "Featured image", done: Boolean(settings?.coverImageUrl) },
        { label: "Creator bio", done: Boolean(profile?.bio) },
        { label: "Teasers content", done: tiers.has("FREE") },
        { label: "VIP content", done: tiers.has("VIP") },
        { label: "Exclusive content", done: tiers.has("VVIP") },
      ]);
    });
  }, []);

  if (!items) return null;
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null; // fully set up — no need to keep nudging

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0, marginBottom: "0.3rem" }}>Get discovered</h2>
      <p style={{ ...mutedSmallStyle, marginTop: 0, marginBottom: "1rem" }}>
        {doneCount} of {items.length} set up — finish these to look your best to fans and other Founding baddies.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
        {items.map((item) => (
          <span key={item.label} style={checklistPillStyle(item.done)}>
            {item.done ? "✓" : "○"} {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function checklistPillStyle(done: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: done ? "var(--success)" : "var(--text-muted)",
    border: `1px solid ${done ? "var(--success)" : "var(--border)"}`,
    borderRadius: "999px",
    padding: "0.3rem 0.75rem",
  };
}

interface CreatorStats {
  followerCount: number;
  subscriberCount: number;
  publishedCount: number;
  totalCount: number;
  totalLikes: number;
}

/** Overview's at-a-glance numbers — see GET /api/creator/stats for what each figure means and why it's computed separately from the public creator-profile endpoint. */
function StatsPanel() {
  const [stats, setStats] = useState<CreatorStats | null>(null);

  useEffect(() => {
    fetch("/api/creator/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setStats(body);
      });
  }, []);

  if (!stats) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Stats</h2>
      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <WalletStat label="Followers" value={stats.followerCount} format="int" />
        <WalletStat label="Subscribers" value={stats.subscriberCount} format="int" />
        <WalletStat label="Published posts" value={stats.publishedCount} format="int" />
        <WalletStat label="Total uploads" value={stats.totalCount} format="int" />
        <WalletStat label="Total likes" value={stats.totalLikes} format="int" />
      </div>
    </div>
  );
}

function WalletPanel() {
  const [wallet, setWallet] = useState<WalletBalances | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);

  function reload() {
    fetch("/api/creator/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setWallet(body);
      });
  }

  useEffect(reload, []);

  async function requestPayout() {
    setRequesting(true);
    setPayoutMessage(null);
    const res = await fetch("/api/creator/payout", { method: "POST" });
    setRequesting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setPayoutMessage(body?.error ?? "Payout request failed.");
      return;
    }
    const body = await res.json();
    setPayoutMessage(`✓ Requested $${body.amountUsd.toFixed(2)} — awaiting admin approval.`);
    reload();
  }

  if (!wallet) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Wallet</h2>
      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <WalletStat label="Available" value={wallet.availableBalanceUsd} />
        <WalletStat label="Pending" value={wallet.pendingBalanceUsd} />
        <WalletStat label="Paid out" value={wallet.paidBalanceUsd} />
        {wallet.availableBalanceUsd > 0 && (
          <button onClick={requestPayout} disabled={requesting} style={publishButtonStyle}>
            {requesting ? "..." : "Request payout"}
          </button>
        )}
      </div>
      {payoutMessage && <p style={{ ...mutedSmallStyle, marginTop: "0.75rem", marginBottom: 0 }}>{payoutMessage}</p>}
      <p style={{ ...mutedSmallStyle, marginTop: "0.85rem", marginBottom: 0 }}>
        Derived from ledger events (Exclusive subscriptions, tips, payouts).
      </p>
    </div>
  );
}

function WalletStat({
  label,
  value,
  format = "usd",
}: {
  label: string;
  value: number;
  format?: "usd" | "int";
}) {
  return (
    <div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>
        {format === "usd" ? `$${value.toFixed(2)}` : value.toLocaleString()}
      </div>
      <div style={mutedSmallStyle}>{label}</div>
    </div>
  );
}

function StatusPanel({ status }: { status: CreatorStatus }) {
  const copy: Record<CreatorStatus, string> = {
    PENDING: "Application received.",
    VERIFICATION_REQUIRED: "Complete your identity, age, and liveness verification below.",
    UNDER_REVIEW: "Verification complete — awaiting admin approval.",
    VERIFIED: "You're a Verified baddie. You can publish monetised content.",
    SUSPENDED: "Your creator account is suspended.",
    REJECTED: "Your application was not approved.",
    BANNED: "Your creator account has been banned.",
  };

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <p style={{ margin: 0, fontSize: "0.95rem" }}>
        <strong>Status:</strong> {status}
      </p>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>{copy[status]}</p>

      {status === "VERIFICATION_REQUIRED" && <VerificationFlow />}
    </div>
  );
}

const fixedPriceDisplayStyle: React.CSSProperties = {
  padding: "0.7rem 0.8rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: "0.95rem",
  fontWeight: 600,
};

interface CreatorSettingsData {
  effectiveVvipPriceUsd: number;
  unlimitedOptedIn: boolean;
  subscriberCountVisible: boolean;
  locationVisible: boolean;
}

/** Pricing, VIP-pass opt-in, and privacy toggles — moved here from the general /settings page so a creator's whole operation (status, wallet, content, and now this) lives in one place. */
function CreatorSettingsPanel() {
  const [data, setData] = useState<CreatorSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setData(body);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/creator/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unlimitedOptedIn: data.unlimitedOptedIn,
        subscriberCountVisible: data.subscriberCountVisible,
        locationVisible: data.locationVisible,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed.");
      return;
    }
    setSaved(true);
  }

  if (!data) return null;

  return (
    <div style={cardStyle}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Creator settings</h2>
      <form onSubmit={handleSubmit}>
        {error && <div style={errorBannerStyle}>{error}</div>}
        <Field
          label="Exclusive subscription price (USD)"
          hint="Fixed platform-wide — every creator's Exclusive tier is the same price, not set per creator."
        >
          <div style={fixedPriceDisplayStyle}>${data.effectiveVvipPriceUsd.toFixed(2)}/mo</div>
        </Field>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.unlimitedOptedIn}
            onChange={(e) => setData({ ...data, unlimitedOptedIn: e.target.checked })}
          />
          Include my VIP-tier content in the platform-wide VIP Pass
        </label>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.subscriberCountVisible}
            onChange={(e) => setData({ ...data, subscriberCountVisible: e.target.checked })}
          />
          Show subscriber count publicly
        </label>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.locationVisible}
            onChange={(e) => setData({ ...data, locationVisible: e.target.checked })}
          />
          Show country and city publicly
        </label>
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save creator settings"}
        </button>
      </form>
    </div>
  );
}

/**
 * Content history and control: every item this creator has ever
 * uploaded (see GET /api/creator/content's own comment on why it's
 * unfiltered by status), each with a Delete action. Delete is a soft
 * delete (DELETE /api/creator/content/:id — see that route's comment)
 * so it stays in this history afterward, just labeled Removed with no
 * further action available on it.
 */
/**
 * The image shown for this creator on discovery cards (Top Baddies,
 * Baddies Near You, etc.) — CreatorProfile.coverImageUrl under the
 * hood, same field /apply can optionally set at signup. Lives in
 * Content management (not Settings) because it's about what represents
 * this creator's content, not account configuration. Leaving it unset
 * falls back to the latest published Free post automatically (see
 * src/lib/discovery/creator-card.ts).
 */
function FeaturedImagePanel() {
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/creator/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setFeaturedImageUrl(body.coverImageUrl ?? null);
      });
  }, []);

  async function save(next: string | null) {
    setFeaturedImageUrl(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/creator/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImageUrl: next }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed.");
      return;
    }
    setSaved(true);
  }

  if (featuredImageUrl === undefined) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Featured image</h2>
      <p style={{ ...mutedSmallStyle, marginTop: "-0.6rem", marginBottom: "1.1rem" }}>
        What shows on The Baddest, baddies near you, and other discovery cards. Keep it
        non-explicit. Leave blank to use your latest Teasers post instead.
      </p>
      <ImageUploadField label="Featured image" value={featuredImageUrl} onChange={save} shape="rect" />
      {saving && <p style={{ ...mutedSmallStyle, marginBottom: 0 }}>Saving...</p>}
      {saved && !saving && <p style={{ ...mutedSmallStyle, marginBottom: 0 }}>✓ Saved</p>}
      {error && <div style={{ ...errorBannerStyle, marginBottom: 0 }}>{error}</div>}
    </div>
  );
}

function ContentPanel() {
  const [items, setItems] = useState<OwnContentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function reload() {
    setLoadingItems(true);
    fetch("/api/creator/content")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((body) => setItems(body.items ?? []))
      .finally(() => setLoadingItems(false));
  }

  useEffect(reload, []);

  async function publish(contentId: string) {
    const res = await fetch(`/api/creator/content/${contentId}/publish`, { method: "POST" });
    if (res.ok) reload();
  }

  async function remove(contentId: string) {
    if (!window.confirm("Delete this post? It will no longer be visible to anyone.")) return;
    setDeletingId(contentId);
    const res = await fetch(`/api/creator/content/${contentId}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) reload();
  }

  return (
    <>
      <FeaturedImagePanel />
      <UploadForm onUploaded={reload} />

      <h2 style={sectionHeadingStyle}>Content history</h2>
      {loadingItems ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing uploaded yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((item) => {
            const removed = item.status === "REMOVED";
            return (
              <div key={item.contentId} style={rowCardStyle}>
                <div style={{ opacity: removed ? 0.55 : 1 }}>
                  <div style={{ fontSize: "0.9rem" }}>{item.caption || "(no caption)"}</div>
                  <div style={mutedSmallStyle}>
                    {item.mediaType} · {ACCESS_LABEL[item.accessLevel]} ·{" "}
                    {removed ? "removed" : item.publishedAt ? "live" : item.status.toLowerCase()} · ♥{" "}
                    {item.likeCount}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  {/* Uploads publish immediately (see the upload route) —
                      this only ever fires for older rows from before that
                      change. */}
                  {item.status === "APPROVED" && !item.publishedAt && (
                    <button onClick={() => publish(item.contentId)} style={publishButtonStyle}>
                      Publish
                    </button>
                  )}
                  {!removed && (
                    <button
                      onClick={() => remove(item.contentId)}
                      disabled={deletingId === item.contentId}
                      style={deleteButtonStyle}
                    >
                      {deletingId === item.contentId ? "..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB per file — matches the API route's own ceiling

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [caption, setCaption] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("FREE");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFilesChosen(fileList: FileList | null) {
    setError(null);
    const chosen = Array.from(fileList ?? []);
    const tooLarge = chosen.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooLarge.length > 0) {
      setError(`${tooLarge.length === 1 ? "One file exceeds" : `${tooLarge.length} files exceed`} the 100MB limit and won't be included: ${tooLarge.map((f) => f.name).join(", ")}`);
    }
    setFiles(chosen.filter((f) => f.size <= MAX_UPLOAD_BYTES));
  }

  async function uploadOne(file: File): Promise<string | null> {
    const mediaType = file.type.startsWith("video/")
      ? "VIDEO"
      : file.type.startsWith("audio/")
        ? "AUDIO"
        : "IMAGE";
    const base64Data = await fileToBase64(file);
    const res = await fetch("/api/creator/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaType,
        mimeType: file.type,
        base64Data,
        accessLevel,
        caption: caption || undefined,
      }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : "Upload failed.";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);

    // Sequential, not parallel — this is one creator's own upload queue,
    // not a race; keeping it sequential also keeps "Uploading 2 of 5..."
    // an honest, literal count rather than an approximation.
    const failures: string[] = [];
    for (const [i, currentFile] of files.entries()) {
      setProgress({ done: i, total: files.length });
      const err = await uploadOne(currentFile);
      if (err) failures.push(`${currentFile.name}: ${err}`);
    }
    setProgress(null);
    setSubmitting(false);

    if (failures.length > 0) {
      setError(
        failures.length === files.length
          ? `Upload failed for all ${files.length} file(s).\n${failures.join("\n")}`
          : `${files.length - failures.length} of ${files.length} uploaded. ${failures.length} failed:\n${failures.join("\n")}`
      );
    }
    setCaption("");
    setFiles([]);
    onUploaded();
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Upload content</h2>
      <p style={{ ...mutedSmallStyle, marginTop: "-0.6rem", marginBottom: "1.1rem" }}>
        Goes live immediately — no admin approval, no waiting.
      </p>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ ...errorBannerStyle, whiteSpace: "pre-line" }}>{error}</div>}

        <Field label="Files" hint="Up to 100MB per file. Select more than one to upload them all at once.">
          <div style={fileFieldRowStyle}>
            <label style={fileUploadButtonStyle}>
              {files.length > 0 ? "Change files" : "Choose files"}
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                onChange={(e) => handleFilesChosen(e.target.files)}
                style={hiddenFileInputStyle}
              />
            </label>
            <span style={mutedSmallStyle}>
              {files.length === 0
                ? "No files chosen"
                : files.length === 1
                  ? files[0]?.name
                  : `${files.length} files chosen`}
            </span>
          </div>
        </Field>

        <Field label="Caption" hint="Optional. Applied to every file in this batch.">
          <input style={inputStyle} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} />
        </Field>

        <Field
          label="Access level"
          hint="Teasers: anyone. VIP: unlocked by the platform-wide VIP pass. Exclusive: only your own subscribers."
        >
          <select
            style={inputStyle}
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
          >
            <option value="FREE">Teasers</option>
            <option value="VIP">VIP</option>
            <option value="VVIP">Exclusive</option>
          </select>
        </Field>

        <button type="submit" style={primaryButtonStyle} disabled={submitting}>
          {submitting && progress ? `Uploading ${progress.done + 1} of ${progress.total}...` : submitting ? "Uploading..." : "Upload"}
        </button>
      </form>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "760px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" };

const rowCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "0.9rem 1.1rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const publishButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const deleteButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const fileFieldRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.7rem",
  flexWrap: "wrap",
  marginTop: "0.4rem",
};

// Same ghost-accent-button treatment used for the ID upload on
// /founding-baddies (src/app/founding-baddies/ApplicationNextSteps.tsx)
// and LocationField's "Detect my location" in components/ui.tsx — a real
// button, not the browser's own unstyled file-input chrome.
const fileUploadButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  background: "transparent",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  flexShrink: 0,
};

const hiddenFileInputStyle: React.CSSProperties = { display: "none" };

