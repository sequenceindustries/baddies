"use client";

import { useEffect, useState } from "react";
import { useSession, pageWrapStyle, cardStyle, displayHeadingStyle } from "@/components/ui";

interface ReferredCreator {
  foundingApplicationId: string;
  stageName: string;
  status: string;
  appliedAt: string;
  attributedAt: string;
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

interface ProfitShare {
  year: number;
  amountUsd: string;
  finalizedAt: string | null;
}

interface DashboardData {
  referralCode: string;
  referralLink: string;
  status: string;
  activatedAt: string;
  referredCreators: ReferredCreator[];
  rewardHistory: RewardEntry[];
  wallet: { pendingBalanceUsd: string; availableBalanceUsd: string; paidBalanceUsd: string } | null;
  agreement: { title: string; version: string; acceptedAt: string } | null;
  profitShares: ProfitShare[];
}

/**
 * A Founding Partner's private dashboard — real data only, own data only
 * (see GET /api/partner/dashboard's own comment on why there's no id
 * parameter anywhere here to tamper with). Reachable pre-launch for a
 * PARTNER-role session (see src/middleware.ts), but this page itself
 * still checks the role client-side too, same defense-in-depth pattern
 * every other role-gated page in this app already uses.
 */
export default function PartnerDashboardPage() {
  const { user, loading } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "PARTNER") return;
    fetch("/api/partner/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [user]);

  if (loading) return <main style={pageWrapStyle} />;

  if (!user || user.role !== "PARTNER") {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Founding Partner dashboard</h1>
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

  return (
    <main style={dashboardWrapStyle}>
      <h1 style={displayHeadingStyle}>Founding Partner dashboard</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        Status: <strong style={{ color: "var(--text)" }}>{data.status}</strong> · activated{" "}
        {new Date(data.activatedAt).toLocaleDateString()}
      </p>

      <SectionCard title="Your referral link">
        <p style={mutedSmallStyle}>
          Share this with a creator — an application submitted through it is attributed to you.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
          <code style={codeBoxStyle}>{data.referralLink}</code>
          <button onClick={copyLink} style={copyButtonStyle}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={`Referred creators (${data.referredCreators.length})`}>
        {data.referredCreators.length === 0 ? (
          <p style={mutedSmallStyle}>No creators have applied through your link yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.referredCreators.map((c) => (
              <div key={c.foundingApplicationId} style={rowStyle}>
                <div>
                  <div style={{ fontSize: "0.9rem" }}>{c.stageName}</div>
                  <div style={mutedSmallStyle}>
                    applied {new Date(c.appliedAt).toLocaleDateString()} · attributed{" "}
                    {new Date(c.attributedAt).toLocaleDateString()}
                  </div>
                </div>
                <span style={statusPillStyle}>{humanize(c.status)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Eligible reward history">
        <p style={mutedSmallStyle}>
          Revenue events recorded for creators attributed to you. This is a real record, not a
          projected balance.
        </p>
        {data.rewardHistory.length === 0 ? (
          <p style={{ ...mutedSmallStyle, marginTop: "0.6rem" }}>No revenue events recorded yet.</p>
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

      <SectionCard title="Annual profit-pool participation">
        <p style={mutedSmallStyle}>
          Founding Partners participate in a share of baddies&apos; annual distributable profit
          pool, calculated once a year from real financial results — never estimated or paid in
          advance.
        </p>
        {data.profitShares.length === 0 ? (
          <p style={{ ...mutedSmallStyle, marginTop: "0.6rem" }}>Nothing has been calculated yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}>
            {data.profitShares.map((s) => (
              <div key={s.year} style={rowStyle}>
                <div style={{ fontSize: "0.88rem" }}>{s.year}</div>
                <div style={{ fontSize: "0.88rem" }}>${s.amountUsd}</div>
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
