"use client";

import { useRef } from "react";

/**
 * The landing page's full-width hero banner — breaks out of the
 * centered layout to span the viewport edge to edge, with the
 * background image reacting to the cursor: a soft parallax drift + zoom
 * on hover, plus a spotlight that tracks the pointer. Eases back to
 * neutral on mouse leave; respects prefers-reduced-motion.
 *
 * hero-banner.jpg (public/) is a purely abstract texture — no people —
 * same reasoning as every other placeholder in this app (see
 * prisma/seed.ts's fallbackSvgBytes comment): Baddies never fabricates
 * or sources a depiction of a person, real or fake, for decorative
 * content. Swap the file to replace the image; the interactive wrapper
 * doesn't care what's inside it, as long as it's still not a person.
 *
 * The parallax/spotlight are driven by two CSS custom properties
 * (--px/--py, normalized -0.5..0.5) written straight to the DOM node in
 * the mousemove handler rather than React state, so 60fps pointer
 * movement doesn't churn a re-render every frame — see globals.css's
 * .hero-banner rules for how each layer reads them.
 */
export function HeroBanner({ children }: { children: React.ReactNode }) {
  const bannerRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const banner = bannerRef.current;
    if (!banner) return;
    const rect = banner.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    banner.style.setProperty("--px", String(px));
    banner.style.setProperty("--py", String(py));
    banner.style.setProperty("--spot-x", `${(px + 0.5) * 100}%`);
    banner.style.setProperty("--spot-y", `${(py + 0.5) * 100}%`);
  }

  function handleMouseLeave() {
    const banner = bannerRef.current;
    if (!banner) return;
    banner.style.setProperty("--px", "0");
    banner.style.setProperty("--py", "0");
  }

  return (
    <div
      ref={bannerRef}
      className="hero-banner"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero-banner.jpg" alt="" className="hero-banner-img" aria-hidden="true" />
      <div className="hero-banner-scrim" aria-hidden="true" />
      <div className="hero-banner-content">{children}</div>
    </div>
  );
}
