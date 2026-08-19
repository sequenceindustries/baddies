"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /dashboard moved to /creator-dashboard so every page's URL says which
 * account type it's for at a glance (see /fan-home, /creator-dashboard,
 * /fan-subscriptions) instead of a generic name that only made sense
 * once you already knew the app. This redirect exists only so an old
 * link/bookmark to /dashboard still lands somewhere real.
 */
export default function DashboardRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/creator-dashboard");
  }, [router]);
  return null;
}
