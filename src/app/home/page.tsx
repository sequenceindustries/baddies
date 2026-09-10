"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /home moved to /fan-home (a fan-only URL at the time), then to /feed
 * once the feed became every signed-in role's default landing page and
 * "fan-home" stopped being an accurate name (social-feed follow-up).
 * This redirect exists only so an old link/bookmark to /home still
 * lands somewhere real.
 */
export default function HomeRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/feed");
  }, [router]);
  return null;
}
