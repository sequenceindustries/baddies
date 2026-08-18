"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, displayHeadingStyle } from "@/components/ui";

interface SubscriptionItem {
  subscriptionId: string;
  creatorProfileId: string;
  creatorDisplayName: string | null;
  tier: "ENTRY" | "VIP";
  status: string;
  priceUsdAtPurchase: number;
  currentPeriodEnd: string;
  cancelledAt: string | null;
}

interface PurchaseItem {
  purchaseId: string;
  contentId: string;
  caption: string | null;
  creatorProfileId: string;
  priceUsd: number;
  createdAt: string;
  refunded: boolean;
}

export default function SubscriptionsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    fetch("/api/fan/subscriptions")
      .then((r) => (r.ok ? r.json() : { subscriptions: [], purchases: [] }))
      .then((body) => {
        setSubscriptions(body.subscriptions ?? []);
        setPurchases(body.purchases ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user) reload();
  }, [user]);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this subscription? Access ends immediately.")) return;
    setBusyId(id);
    const res = await fetch(`/api/fan/subscriptions/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (res.ok) reload();
  }

  if (sessionLoading) return <main style={mainStyle} />;
  if (!user) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>My subscriptions</h1>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : (
        <>
          <h2 style={sectionHeadingStyle}>Subscriptions</h2>
          {subscriptions.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No subscriptions yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2rem" }}>
              {subscriptions.map((s) => (
                <div key={s.subscriptionId} style={rowCardStyle}>
                  <div>
                    <Link href={`/creators/${s.creatorProfileId}`} style={{ color: "var(--text)", fontWeight: 600 }}>
                      {s.creatorDisplayName ?? "Unnamed creator"}
                    </Link>
                    <div style={mutedSmallStyle}>
                      {s.tier} · ${s.priceUsdAtPurchase.toFixed(2)}/mo · {s.status}
                      {s.status === "ACTIVE" &&
                        ` · renews ${new Date(s.currentPeriodEnd).toLocaleDateString()}`}
                    </div>
                  </div>
                  {s.status === "ACTIVE" && (
                    <button
                      onClick={() => cancel(s.subscriptionId)}
                      disabled={busyId === s.subscriptionId}
                      style={cancelButtonStyle}
                    >
                      {busyId === s.subscriptionId ? "..." : "Cancel"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <h2 style={sectionHeadingStyle}>Pay-per-view purchases</h2>
          {purchases.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No purchases yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {purchases.map((p) => (
                <div key={p.purchaseId} style={rowCardStyle}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.caption || "(no caption)"}</div>
                    <div style={mutedSmallStyle}>
                      ${p.priceUsd.toFixed(2)} · {new Date(p.createdAt).toLocaleDateString()}
                      {p.refunded ? " · refunded" : ""}
                    </div>
                  </div>
                  <Link href={`/creators/${p.creatorProfileId}`} style={{ color: "var(--accent-gold)", fontSize: "0.85rem" }}>
                    View creator
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "760px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "1.5rem 0 1rem",
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

const cancelButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};
