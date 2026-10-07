/**
 * Thin client-side wrapper around the GA4 gtag snippet in app/layout.tsx.
 * A no-op when gtag hasn't loaded (blocked by an ad blocker, server
 * render, tests) — analytics must never break a sign-up or checkout.
 *
 * Event names follow GA4's recommended events (sign_up, begin_checkout,
 * purchase) so GA's built-in reports and key-event templates pick them up.
 */
/** Set by the Google OAuth callback when it creates a new account. */
export const GA_SIGNUP_COOKIE = "baddies_ga_signup";

type GtagParams = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (command: "event", name: string, params?: GtagParams) => void;
  }
}

export function trackEvent(name: string, params?: GtagParams): void {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    // Never let analytics surface as a user-facing error.
  }
}

export type CheckoutKind = "vip_pass" | "exclusive";

export function trackBeginCheckout(kind: CheckoutKind, extra?: GtagParams): void {
  trackEvent("begin_checkout", {
    currency: "USD",
    // The page navigates to the payment provider right after this.
    transport_type: "beacon",
    items: [{ item_id: kind, item_name: kind === "vip_pass" ? "VIP Pass" : "Exclusive subscription" }],
    ...extra,
  });
}
