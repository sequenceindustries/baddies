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
 * Read-model display — balances are derived from LedgerEntry history by
 * src/lib/ledger/service.ts#recomputeWalletBalances, recomputed on every
 * dummy checkout (see src/app/api/checkout/*) and every payout approval.
 */
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
                  {item.publishedAt ? " · live" : ` · ${item.status.toLowerCase()}`} · ♥ {item.likeCount}
                </div>
              </div>
              {/* Uploads publish immediately (see the upload route) — this
                  only ever fires for older rows from before that change. */}
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
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("FREE");
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
    setFile(null);
    onUploaded();
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Upload content</h2>
      <p style={{ ...mutedSmallStyle, marginTop: "-0.6rem", marginBottom: "1.1rem" }}>
        Goes live immediately — no admin approval, no waiting.
      </p>
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

        <Field
          label="Access level"
          hint="Free: anyone. VIP: unlocked by the platform-wide VIP pass. Exclusive: only your own subscribers."
        >
          <select
            style={inputStyle}
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
          >
            <option value="FREE">Free</option>
            <option value="VIP" disabled={!canMonetise}>
              VIP {canMonetise ? "" : "(verified creators only)"}
            </option>
            <option value="VVIP" disabled={!canMonetise}>
              Exclusive {canMonetise ? "" : "(verified creators only)"}
            </option>
          </select>
        </Field>

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
