"use client";

import { useEffect, useState } from "react";
import { useSession, displayHeadingStyle, cardStyle, SignInGate } from "@/components/ui";

interface WalletBalances {
  pendingBalanceUsd: number;
  availableBalanceUsd: number;
  paidBalanceUsd: number;
}

/**
 * Its own page now, not a card buried in the Creator Dashboard's
 * Overview tab — reached from the nav's account menu ("Wallet
 * ($balance)", see WalletMenuLink in components/ui.tsx), same
 * /api/creator/wallet + /api/creator/payout backing this always had.
 * Read-model display — balances are derived from LedgerEntry history by
 * src/lib/ledger/service.ts#recomputeWalletBalances, recomputed on every
 * dummy checkout (see src/app/api/checkout/*) and every payout approval.
 */
export default function WalletPage() {
  const { user, loading: sessionLoading } = useSession();
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

  useEffect(() => {
    if (user) reload();
  }, [user]);

  if (sessionLoading) return <main style={mainStyle} />;
  if (!user) return <SignInGate message="Sign in to view your wallet." />;

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

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Wallet</h1>
      {!wallet ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div style={cardStyle}>
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
      )}
    </main>
  );
}

function WalletStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>${value.toFixed(2)}</div>
      <div style={mutedSmallStyle}>{label}</div>
    </div>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "760px", margin: "0 auto" };
const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" };
const publishButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};
