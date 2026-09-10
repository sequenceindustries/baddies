"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /creator-dashboard was folded into /profile as additional tabs
 * (Overview/Content/Settings, alongside Profile's own Profile/
 * Application details tabs) per direct request — "remove dashboard
 * from menu and merge with profile". This redirect exists only so an
 * old link/bookmark to /creator-dashboard still lands somewhere real,
 * matching the same pattern already used for /home, /dashboard,
 * /subscriptions, and /fan-home.
 */
export default function CreatorDashboardRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile");
  }, [router]);
  return null;
}
