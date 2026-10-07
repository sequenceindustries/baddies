"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, displayHeadingStyle, SkeletonBlock, SignInGate } from "@/components/ui";
import { SegmentedTabs } from "@/components/segmented-tabs";

type SubsTab = "vip" | "subscriptions" | "history";

interface VipPass {
  subscriptionId: string;
  status: string;
  priceUsdAtPurchase: number;
  durationMonths: number;
  currentPeriodEnd: string;
  cancelledAt: string | null;
}

interface SubscriptionItem {
  subscriptionId: string;
  creatorProfileId: string;
  creatorDisplayName: string | null;
  status: string;
  priceUsdAtPurchase: number;
  durationMonths: number;
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
  const [vipPass, setVipPass] = useState<VipPass | null>(null);
  // Cheapest per-month rate across the 3/6/12-month VIP Pass packages.
  const [vipPassFromMonthlyUsd, setVipPassFromMonthlyUsd] = useState<number | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Initialized to the literal "vip" rather than derived from the tabs
  // array below — that array depends on `purchases`, which isn't
  // populated until after the initial fetch resolves, so deriving the
  // default from it would flash/mismatch on first render.
  const [tab, setTab] = useState<SubsTab>("vip");

  function reload() {
    setLoading(true);
    fetch("/api/fan/subscriptions")
      .then((r) => (r.ok ? r.json() : { vipPass: null, subscriptions: [], purchases: [] }))
      .then((body) => {
        setVipPass(body.vipPass ?? null);
        const packages: { priceUsd: number; durationMonths: number }[] = Array.isArray(body.vipPassPackages)
          ? body.vipPassPackages
          : [];
        setVipPassFromMonthlyUsd(
          packages.length ? Math.min(...packages.map((p) => p.priceUsd / p.durationMonths)) : null
        );
        setSubscriptions(body.subscriptions ?? []);
        setPurchases(body.purchases ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user) reload();
  }, [user]);

  if (sessionLoading) return <main style={mainStyle} />;
  if (!user) {
    return <SignInGate heading="Sign in required" message="Sign in to see your VIP Pass and creator subscriptions." />;
  }

  const tabs: { value: SubsTab; label: string }[] = [
    { value: "vip", label: "VIP Pass" },
    { value: "subscriptions", label: "Subscriptions" },
  ];
  if (purchases.length > 0) tabs.push({ value: "history", label: "History" });
  // A tab that only exists once purchases load shouldn't leave the
  // viewer stranded on it if it later turns out to have zero rows
  // (e.g. a stale selection from a prior visit) — falls back to "vip".
  const activeTab = tab === "history" && purchases.length === 0 ? "vip" : tab;

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>My subscriptions</h1>

      {loading ? (
        <SkeletonBlock height="10rem" />
      ) : (
        <>
          <SegmentedTabs tabs={tabs} active={activeTab} onChange={setTab} />

          {activeTab === "vip" && (
            <>
              <h2 style={sectionHeadingStyle}>Platform VIP Pass</h2>
              {vipPass && vipPass.status === "ACTIVE" ? (
                <div style={rowCardStyle}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Active</div>
                    <div style={mutedSmallStyle}>
                      {packageLabel(vipPass.priceUsdAtPurchase, vipPass.durationMonths)} · active until{" "}
                      {new Date(vipPass.currentPeriodEnd).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={prepaidNoteStyle}>Prepaid · no auto-renewal</span>
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)" }}>
                  No active VIP Pass.{" "}
                  <Link href="/feed" style={{ color: "var(--accent)", fontWeight: 600 }}>
                    Get it on your Timeline
                  </Link>{" "}
                  {vipPassFromMonthlyUsd != null && `from $${vipPassFromMonthlyUsd.toFixed(2)}/month `}to unlock VIP-tier content across
                  every participating creator.
                </p>
              )}
            </>
          )}

          {activeTab === "subscriptions" && (
            <>
              <h2 style={sectionHeadingStyle}>Exclusive subscriptions</h2>
              {subscriptions.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No creator subscriptions yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {subscriptions.map((s) => (
                    <div key={s.subscriptionId} style={rowCardStyle}>
                      <div>
                        <Link href={`/creators/${s.creatorProfileId}`} style={{ color: "var(--text)", fontWeight: 600 }}>
                          {s.creatorDisplayName ?? "Unnamed creator"}
                        </Link>
                        <div style={mutedSmallStyle}>
                          {packageLabel(s.priceUsdAtPurchase, s.durationMonths)} · {s.status}
                          {s.status === "ACTIVE" &&
                            ` · active until ${new Date(s.currentPeriodEnd).toLocaleDateString()}`}
                        </div>
                      </div>
                      {s.status === "ACTIVE" && <span style={prepaidNoteStyle}>Prepaid · no auto-renewal</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "history" && purchases.length > 0 && (
            <>
              <h2 style={sectionHeadingStyle}>Pay-per-view purchases (legacy)</h2>
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
                    <Link
                      href={`/creators/${p.creatorProfileId}`}
                      style={{ color: "var(--accent)", fontSize: "0.85rem" }}
                    >
                      View creator
                    </Link>
                  </div>
                ))}
              </div>
            </>
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

// Packages are paid upfront and simply end on their date — there's no
// recurring charge to cancel (a "Cancel" here used to end access
// immediately, throwing away time the fan had already paid for).
const prepaidNoteStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

// Packages are prepaid, never auto-renewing — a 1-month package reads
// "$5.00/mo", a longer one shows its real total and length.
function packageLabel(priceUsd: number, durationMonths: number): string {
  return durationMonths > 1 ? `$${priceUsd.toFixed(2)} · ${durationMonths}-month package` : `$${priceUsd.toFixed(2)}/mo`;
}
