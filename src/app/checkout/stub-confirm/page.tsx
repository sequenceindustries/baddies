"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface StubOrder {
  orderId: string;
  orderType: "EXCLUSIVE_SUBSCRIPTION" | "VIP_PASS";
  amountUsd: number;
  currency: string;
  durationMonths: number;
  status: string;
  creatorDisplayName: string | null;
}

/**
 * Dev-only stand-in for a real payment processor's hosted checkout
 * page — StubPaymentProvider.createHostedCheckoutSession redirects
 * here instead of a real hosted page. Lets a developer/tester simulate
 * the processor's own outcome; "Simulate success" calls
 * POST /api/checkout/stub-confirm, which delivers the exact same
 * webhook shape a real processor would to
 * /api/webhooks/payment — this page itself never activates anything.
 * Both this page and its API route are hard-blocked outside
 * PAYMENT_PROVIDER=stub (see that route's own comment) — never reachable
 * in an environment serving real users.
 */
export default function StubConfirmPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [order, setOrder] = useState<StubOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"success" | "failure" | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Missing orderId.");
      return;
    }
    fetch(`/api/checkout/stub-confirm?orderId=${orderId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Order not found.");
          return;
        }
        setOrder(await res.json());
      })
      .catch(() => setError("Something went wrong loading this order."));
  }, [orderId]);

  async function simulate(outcome: "success" | "failure") {
    if (!orderId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout/stub-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, outcome }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't simulate this outcome.");
      return;
    }
    setResult(outcome);
  }

  return (
    <main style={{ padding: "4rem 1.75rem", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500 }}>
        Dev checkout — stub processor
      </h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", fontSize: "0.9rem" }}>
        No real payment provider is wired up yet. This page stands in for a
        real hosted checkout page in local/dev testing only.
      </p>

      {error && (
        <p style={{ color: "var(--danger)", marginTop: "1.5rem", fontSize: "0.9rem" }}>{error}</p>
      )}

      {order && !result && (
        <div style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <p style={{ fontWeight: 600 }}>
            {order.orderType === "VIP_PASS" ? "Platform VIP Pass" : `Exclusive — ${order.creatorDisplayName ?? "creator"}`}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            ${order.amountUsd.toFixed(2)} {order.currency} · {order.durationMonths}-month package
          </p>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
            <button
              onClick={() => simulate("success")}
              disabled={busy}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: "var(--radius)",
                fontWeight: 600,
                fontSize: "0.85rem",
                background: "var(--accent)",
                color: "var(--bg)",
                border: "none",
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "···" : "Simulate success"}
            </button>
            <button
              onClick={() => simulate("failure")}
              disabled={busy}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: "var(--radius)",
                fontWeight: 600,
                fontSize: "0.85rem",
                background: "var(--surface-raised)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                cursor: busy ? "default" : "pointer",
              }}
            >
              Simulate failure
            </button>
          </div>
        </div>
      )}

      {result === "success" && (
        <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
          ✓ Payment simulated as succeeded. The webhook has run — refresh the
          page you started from to see the new entitlement.
        </p>
      )}
      {result === "failure" && (
        <p style={{ marginTop: "1.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Payment simulated as failed. No entitlement was created.
        </p>
      )}
    </main>
  );
}
