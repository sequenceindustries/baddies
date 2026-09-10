"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /dashboard moved to /creator-dashboard (a creator-only URL at the
 * time), then folded into /profile as additional tabs once the
 * dashboard itself was merged there (social-feed follow-up — see
 * /app/creator-dashboard/page.tsx's own redirect comment). This
 * redirect exists only so an old link/bookmark to /dashboard still
 * lands somewhere real.
 */
export default function DashboardRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile");
  }, [router]);
  return null;
}
