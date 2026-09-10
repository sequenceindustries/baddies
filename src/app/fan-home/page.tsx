"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /fan-home moved to /feed once the feed became every signed-in role's
 * default landing page, not just fans' (social-feed follow-up) — see
 * /app/feed/page.tsx's own comment. This redirect exists only so an old
 * link/bookmark (or a since-shared URL from before this rename) still
 * lands somewhere real, matching the same pattern already used for
 * /home, /dashboard, and /subscriptions.
 */
export default function FanHomeRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/feed");
  }, [router]);
  return null;
}
