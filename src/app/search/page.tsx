"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Search was merged into /discovery (one page: search box, Top Baddies/
 * Baddies Near You, browse-by-category) rather than staying a second
 * destination. This redirect exists only so an old link/bookmark to
 * /search still lands somewhere real.
 */
export default function SearchRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/discovery");
  }, [router]);
  return null;
}
