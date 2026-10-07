"use client";

import { useEffect } from "react";
import { GA_SIGNUP_COOKIE, trackEvent } from "@/lib/analytics/gtag";

/**
 * Sends GA4's `purchase` event when a fan lands back on baddies from the
 * hosted checkout (the success URL built in /api/checkout/vip-pass and
 * /api/checkout/subscribe carries ?checkout=success&order=&kind=&value=).
 *
 * Analytics only: landing on the success URL is NOT proof of payment —
 * access is granted solely by the signed payment webhook. Deduped per
 * order in sessionStorage so a refresh doesn't double-count, and the
 * tracking params are stripped from the address bar afterwards.
 *
 * Also sends `sign_up` for a brand-new Google account, flagged by the
 * one-shot GA_SIGNUP_COOKIE the OAuth callback sets (email sign-ups are
 * tracked directly in the register form).
 */

// gtag loads afterInteractive, so it may not exist yet on mount.
function whenGtagReady(send: () => void) {
  if (typeof window.gtag === "function") send();
  else window.setTimeout(send, 2500);
}

export function AnalyticsEvents() {
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c === `${GA_SIGNUP_COOKIE}=google`)) {
      document.cookie = `${GA_SIGNUP_COOKIE}=; Max-Age=0; path=/`;
      whenGtagReady(() => trackEvent("sign_up", { method: "google" }));
    }

    const url = new URL(window.location.href);
    const order = url.searchParams.get("order");
    if (url.searchParams.get("checkout") !== "success" || !order) return;

    const kind = url.searchParams.get("kind") === "vip_pass" ? "vip_pass" : "exclusive";
    const value = Number(url.searchParams.get("value"));
    const key = `ga-purchase-${order}`;
    let alreadySent = false;
    try {
      alreadySent = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked — worst case a refresh counts twice.
    }

    if (!alreadySent) {
      whenGtagReady(() =>
        trackEvent("purchase", {
          transaction_id: order,
          currency: "USD",
          ...(Number.isFinite(value) && value > 0 ? { value } : {}),
          items: [{ item_id: kind, item_name: kind === "vip_pass" ? "VIP Pass" : "Exclusive subscription" }],
        })
      );
    }

    for (const p of ["order", "kind", "value"]) url.searchParams.delete(p);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  return null;
}
