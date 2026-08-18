"use client";

import { useEffect, useState } from "react";
import {
  useSession,
  displayHeadingStyle,
  cardStyle,
  Field,
  inputStyle,
  primaryButtonStyle,
  errorBannerStyle,
} from "@/components/ui";

type CreatorStatus =
  | "PENDING"
  | "VERIFICATION_REQUIRED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "SUSPENDED"
  | "REJECTED"
  | "BANNED";

type AccessLevel = "PUBLIC_PREVIEW" | "ENTRY" | "VIP" | "PPV";

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
}

const VERIFICATION_STEPS: { type: "IDENTITY" | "AGE" | "LIVENESS"; label: string }[] = [
  { type: "IDENTITY", label: "Identity" },
  { type: "AGE", label: "Age" },
  { type: "LIVENESS", label: "Liveness" },
];

export default function CreatorDashboardPage() {
  const { user, loading, refresh } = useSession();

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

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Creator Dashboard</h1>
      <StatusPanel status={user.creatorProfile.status as CreatorStatus} onAdvance={refresh} />
      <WalletPanel />
      {user.creatorProfile.status !== "REJECTED" && user.creatorProfile.status !== "BANNED" && (
        <ContentPanel canMonetise={user.creatorProfile.status === "VERIFIED"} />
      )}
    </main>
  );
}

interface WalletBalances {
  pendingBalanceUsd: number;
  availableBalanceUsd: number;
  paidBalanceUsd: number;
}

/**
 * Read-model display only — balances are derived from LedgerEntry history
 * by src/lib/ledger/service.ts#recomputeWalletBalances, recomputed on every
 * dummy checkout (see src/app/api/checkout/*). No payout flow exists yet.
 */
function WalletPanel() {
  const [wallet, setWallet] = useState<WalletBalances | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setWallet(body);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wallet) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Wallet</h2>
      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <WalletStat label="Available" value={wallet.availableBalanceUsd} />
        <WalletStat label="Pending" value={wallet.pendingBalanceUsd} />
        <WalletStat label="Paid out" value={wallet.paidBalanceUsd} />
      </div>
      <p style={{ ...mutedSmallStyle, marginTop: "0.85rem", marginBottom: 0 }}>
        Derived from ledger events (subscriptions, PPV unlocks, tips) — no payout flow yet.
      </p>
    </div>
  );
}

function WalletStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>
        ${value.toFixed(2)}
      </div>
      <div style={mutedSmallStyle}>{label}</div>
    </div>
  );
}

function StatusPanel({ status, onAdvance }: { status: CreatorStatus; onAdvance: () => void }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startVerification(type: "IDENTITY" | "AGE" | "LIVENESS") {
    setBusy(type);
    setError(null);
    const res = await fetch("/api/creator/verification/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationType: type }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("Couldn't start verification. Try again.");
      return;
    }
    setCompleted((prev) => new Set(prev).add(type));
    onAdvance(); // re-fetch session — status may have auto-advanced to UNDER_REVIEW
  }

  const copy: Record<CreatorStatus, string> = {
    PENDING: "Application received.",
    VERIFICATION_REQUIRED: "Complete identity, age, and liveness verification below.",
    UNDER_REVIEW: "Verification complete — awaiting admin approval.",
    VERIFIED: "You're a Verified Baddie. You can publish monetised content.",
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

      {status === "VERIFICATION_REQUIRED" && (
        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem", flexWrap: "wrap" }}>
          {VERIFICATION_STEPS.map((step) => (
            <button
              key={step.type}
              onClick={() => startVerification(step.type)}
              disabled={busy === step.type || completed.has(step.type)}
              style={stepButtonStyle(completed.has(step.type))}
            >
              {completed.has(step.type) ? `✓ ${step.label}` : busy === step.type ? "..." : `Verify ${step.label}`}
            </button>
          ))}
        </div>
      )}
      {error && <div style={{ ...errorBannerStyle, marginTop: "1rem", marginBottom: 0 }}>{error}</div>}
    </div>
  );
}

function ContentPanel({ canMonetise }: { canMonetise: boolean }) {
  const [items, setItems] = useState<OwnContentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

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

  return (
    <>
      <UploadForm canMonetise={canMonetise} onUploaded={reload} />

      <h2 style={sectionHeadingStyle}>Your content</h2>
      {loadingItems ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing uploaded yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((item) => (
            <div key={item.contentId} style={rowCardStyle}>
              <div>
                <div style={{ fontSize: "0.9rem" }}>{item.caption || "(no caption)"}</div>
                <div style={mutedSmallStyle}>
                  {item.mediaType} · {item.accessLevel}
                  {item.priceUsd != null ? ` · $${Number(item.priceUsd).toFixed(2)}` : ""} · {item.status}
                  {item.publishedAt ? " · published" : ""}
                </div>
              </div>
              {item.status === "APPROVED" && !item.publishedAt && (
                <button onClick={() => publish(item.contentId)} style={publishButtonStyle}>
                  Publish
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function UploadForm({ canMonetise, onUploaded }: { canMonetise: boolean; onUploaded: () => void }) {
  const [caption, setCaption] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("PUBLIC_PREVIEW");
  const [priceUsd, setPriceUsd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);

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
        priceUsd: accessLevel === "PPV" ? Number(priceUsd) : undefined,
        caption: caption || undefined,
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Upload failed.");
      return;
    }
    setCaption("");
    setPriceUsd("");
    setFile(null);
    onUploaded();
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Upload content</h2>
      <form onSubmit={handleSubmit}>
        {error && <div style={errorBannerStyle}>{error}</div>}

        <Field label="File">
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ marginTop: "0.4rem" }}
          />
        </Field>

        <Field label="Caption" hint="Optional.">
          <input style={inputStyle} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} />
        </Field>

        <Field label="Access level">
          <select
            style={inputStyle}
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
          >
            <option value="PUBLIC_PREVIEW">Free preview</option>
            <option value="ENTRY" disabled={!canMonetise}>
              Entry {canMonetise ? "" : "(verified creators only)"}
            </option>
            <option value="VIP" disabled={!canMonetise}>
              VIP {canMonetise ? "" : "(verified creators only)"}
            </option>
            <option value="PPV" disabled={!canMonetise}>
              Pay per view {canMonetise ? "" : "(verified creators only)"}
            </option>
          </select>
        </Field>

        {accessLevel === "PPV" && (
          <Field label="Price (USD)">
            <input
              style={inputStyle}
              type="number"
              min="0.01"
              step="0.01"
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              required
            />
          </Field>
        )}

        <button type="submit" style={primaryButtonStyle} disabled={submitting}>
          {submitting ? "Uploading..." : "Upload"}
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
  background: "var(--accent-gold)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

function stepButtonStyle(done: boolean): React.CSSProperties {
  return {
    background: done ? "var(--surface-raised)" : "var(--accent-gold)",
    color: done ? "var(--text-muted)" : "var(--bg)",
    border: done ? "1px solid var(--border)" : "none",
    borderRadius: "var(--radius)",
    padding: "0.45rem 0.85rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: done ? "default" : "pointer",
  };
}
