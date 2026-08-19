"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /subscriptions moved to /fan-subscriptions so every page's URL says
 * which account type it's for at a glance (see /fan-home,
 * /creator-dashboard, /fan-subscriptions) instead of a generic name that
 * only made sense once you already knew the app. This redirect exists
 * only so an old link/bookmark to /subscriptions still lands somewhere
 * real.
 */
export default function SubscriptionsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/fan-subscriptions");
  }, [router]);
  return null;
}
