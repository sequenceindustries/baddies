"use client";

import { useEffect, useState } from "react";
import { useSession, pageWrapStyle, cardStyle, displayHeadingStyle } from "@/components/ui";

interface ReferredCreator {
  foundingApplicationId: string;
  stageName: string;
  status: string;
  appliedAt: string;
  attributedAt: string;
  subscriptionRevenueGeneratedUsd: number;
  commissionGeneratedUsd: number;
  partnerPercentage: number | null;
  earningPeriodStartAt: string | null;
  earningPeriodEndAt: string | null;
  earningPeriodStatus: "NOT_STARTED" | "ACTIVE" | "EXPIRED";
}

interface RewardEntry {
  id: string;
  type: string;
  grossAmount: string;
  creatorShareAmount: string | null;
  platformShareAmount: string | null;
  creatorProfileId: string | null;
  createdAt: string;
}

interface PayoutEntry {
  id: string;
  amountUsd: number;
  status: string;
  requestedAt: string;
  processedAt: string | null;
}

interface Earnings {
  lifetimeUsd: number;
  currentMonthUsd: number;
  pendingUsd: number;
  payableUsd: number;
  paidUsd: number;
}

interface DashboardData {
  referralCode: string;
  referralLink: string;
  status: string;
  activatedAt: string;
  joinedPositionNumber: number | null;
  positionsFilled: number;
  positionsLimit: number;
  referredCreators: ReferredCreator[];
  totalCreatorsReferred: number;
  activeReferredCreators: number;
  totalSubscriptionRevenueGeneratedUsd: number;
  remainingActiveEarningPeriods: number;
  rewardHistory: RewardEntry[];
  earnings: Earnings;
  payoutHistory: PayoutEntry[];
  wallet: { pendingBalanceUsd: string; availableBalanceUsd: string; paidBalanceUsd: string } | null;
  agreement: { title: string; version: string; acceptedAt: string } | null;
}

/**
 * A Founding Partner's private dashboard — real data only, own data only
 * (see GET /api/partner/dashboard's own comment on why there's no id
 * parameter anywhere here to tamper with). Reachable pre-launch for any
 * authenticated session (see src/middleware.ts), but this page itself
 * still checks real ownership client-side too, same defense-in-depth
 * pattern every other gated page in this app already uses — via
 * user.foundingPartner, not role, since role alone can't tell "is this
 * account a Founding Partner" once it's also applied as a creator (role
 * becomes CREATOR then — see /api/partner/dashboard's own comment).
 *
 * Every number here is a real stored figure, never a projection — see
 * that route's own comment for exactly where each one comes from.
 */
export default function PartnerDashboardPage() {
  const { user, loading } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [copied, setCopied] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);

  function reload() {
    fetch("/api/partner/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }

  useEffect(() => {
    if (!user || !user.foundingPartner) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) return <main style={pageWrapStyle} />;

  if (!user || !user.foundingPartner) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Founding Partner Dashboard</h1>
        <p style={{ color: "var(--text-muted)" }}>This dashboard is only available to Founding Partners.</p>
      </main>
    );
  }

  if (!data) {
    return <main style={dashboardWrapStyle} />;
  }

  function copyLink() {
    if (!data) return;
    navigator.clipboard.writeText(data.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function requestPayout() {
    setPayoutBusy(true);
    setPayoutMessage(null);
    try {
      const res = await fetch("/api/partner/payout", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setPayoutMessage(body.error ?? "Couldn't request a payout.");
      } else {
        setPayoutMessage(`Payout of $${Number(body.amountUsd).toFixed(2)} requested.`);
        reload();
      }
    } catch {
      setPayoutMessage("Couldn't request a payout — try again.");
    } finally {
      setPayoutBusy(false);
    }
  }

  return (
    <main style={dashboardWrapStyle}>
      <h1 style={displayHeadingStyle}>Founding Partner Dashboard</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        Status: <strong style={{ color: "var(--text)" }}>{data.status}</strong>
        {data.joinedPositionNumber != null && (
          <>
            {" "}
            · Founding Partner #{data.joinedPositionNumber} of {data.positionsLimit}
          </>
        )}
        {" "}
        · activated {new Date(data.activatedAt).toLocaleDateString()}
      </p>

      <SectionCard title="Overview">
        <div style={statGridStyle}>
          <Stat label="Creators referred" value={String(data.totalCreatorsReferred)} />
          <Stat label="Active creators" value={String(data.activeReferredCreators)} />
          <Stat label="Subscription revenue generated" value={usd(data.totalSubscriptionRevenueGeneratedUsd)} />
          <Stat label="Active earning periods" value={String(data.remainingActiveEarningPeriods)} />
        </div>
      </SectionCard>

      <SectionCard title="Your referral link">
        <p style={mutedSmallStyle}>
          Share this with a creator — an application submitted through it is attributed to you. You earn
          {data.referredCreators[0]?.partnerPercentage != null
            ? ` ${(data.referredCreators[0]!.partnerPercentage * 100).toFixed(0)}%`
            : " a share"}{" "}
          of their net subscription revenue for 12 months.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
          <code style={codeBoxStyle}>{data.referralLink}</code>
          <button onClick={copyLink} style={copyButtonStyle}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Earnings">
        <div style={statGridStyle}>
          <Stat label="This month" value={usd(data.earnings.currentMonthUsd)} />
          <Stat label="Lifetime" value={usd(data.earnings.lifetimeUsd)} />
          <Stat label="Pending" value={usd(data.earnings.pendingUsd)} hint="still in its holding period" />
          <Stat label="Available for payout" value={usd(data.earnings.payableUsd)} />
          <Stat label="Paid out" value={usd(data.earnings.paidUsd)} />
        </div>
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            onClick={requestPayout}
            disabled={payoutBusy || data.earnings.payableUsd <= 0}
            style={{
              ...copyButtonStyle,
              opacity: payoutBusy || data.earnings.payableUsd <= 0 ? 0.5 : 1,
              cursor: payoutBusy || data.earnings.payableUsd <= 0 ? "default" : "pointer",
            }}
          >
            {payoutBusy ? "Requesting…" : "Request payout"}
          </button>
          {payoutMessage && <span style={mutedSmallStyle}>{payoutMessage}</span>}
        </div>

        {data.payoutHistory.length > 0 && (
          <div style={{ marginTop: "1.1rem" }}>
            <div style={{ ...mutedSmallStyle, marginBottom: "0.5rem" }}>Payout history</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data.payoutHistory.map((p) => (
                <div key={p.id} style={rowStyle}>
                  <div>
                    <div style={{ fontSize: "0.88rem" }}>{usd(p.amountUsd)}</div>
                    <div style={mutedSmallStyle}>
                      requested {new Date(p.requestedAt).toLocaleDateString()}
                      {p.processedAt && ` · processed ${new Date(p.processedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <span style={statusPillStyle}>{humanize(p.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Referred creators (${data.referredCreators.length})`}>
        {data.referredCreators.length === 0 ? (
          <p style={mutedSmallStyle}>No creators have applied through your link yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.referredCreators.map((c) => (
              <div key={c.foundingApplicationId} style={{ ...rowStyle, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "0.9rem" }}>{c.stageName}</div>
                  <div style={mutedSmallStyle}>
                    applied {new Date(c.appliedAt).toLocaleDateString()} · attributed{" "}
                    {new Date(c.attributedAt).toLocaleDateString()}
                  </div>
                  <div style={{ ...mutedSmallStyle, marginTop: "0.3rem" }}>
                    revenue {usd(c.subscriptionRevenueGeneratedUsd)} · your commission {usd(c.commissionGeneratedUsd)}
                  </div>
                  {c.earningPeriodStartAt && c.earningPeriodEndAt && (
                    <div style={mutedSmallStyle}>
                      earning period {new Date(c.earningPeriodStartAt).toLocaleDateString()} –{" "}
                      {new Date(c.earningPeriodEndAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                  <span style={statusPillStyle}>{humanize(c.status)}</span>
                  {c.earningPeriodStatus !== "NOT_STARTED" && (
                    <span style={{ ...mutedSmallStyle, fontSize: "0.72rem" }}>
                      earning period {c.earningPeriodStatus === "ACTIVE" ? "active" : "expired"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Ledger history">
        <p style={mutedSmallStyle}>
          Every commission and reversal recorded against your account. This is a real record, not a
          projected balance.
        </p>
        {data.rewardHistory.length === 0 ? (
          <p style={{ ...mutedSmallStyle, marginTop: "0.6rem" }}>No entries recorded yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}>
            {data.rewardHistory.map((r) => (
              <div key={r.id} style={rowStyle}>
                <div>
                  <div style={{ fontSize: "0.88rem" }}>{humanize(r.type)}</div>
                  <div style={mutedSmallStyle}>{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ fontSize: "0.88rem", textAlign: "right" }}>${r.grossAmount}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {data.agreement && (
        <SectionCard title="Agreement">
          <p style={mutedSmallStyle}>
            {data.agreement.title} ({data.agreement.version}) — accepted{" "}
            {new Date(data.agreement.acceptedAt).toLocaleDateString()}
          </p>
        </SectionCard>
      )}
    </main>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 500, margin: "0 0 0.75rem" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>{value}</div>
      <div style={mutedSmallStyle}>
        {label}
        {hint ? ` (${hint})` : ""}
      </div>
    </div>
  );
}

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

const dashboardWrapStyle: React.CSSProperties = {
  maxWidth: "760px",
  margin: "2.5rem auto",
  padding: "0 1.5rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 };

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "1rem",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "0.7rem 0.9rem",
};

const statusPillStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.03em",
  color: "var(--accent)",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.2rem 0.6rem",
  flexShrink: 0,
};

const codeBoxStyle: React.CSSProperties = {
  flex: 1,
  minWidth: "220px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "0.6rem 0.8rem",
  fontSize: "0.82rem",
  overflowX: "auto",
  whiteSpace: "nowrap",
};

const copyButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "8px",
  padding: "0.6rem 1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  flexShrink: 0,
};
