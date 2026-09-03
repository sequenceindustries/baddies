"use client";

import { useRef } from "react";

/**
 * The landing page hero's interactive visual — tilts toward the cursor
 * (a light 3D parallax, capped at a few degrees so it reads as
 * "reactive" rather than gimmicky) with a soft spotlight that follows
 * the pointer and two background orbs drifting at different depths,
 * then eases back to neutral on mouse leave.
 *
 * Deliberately abstract, not a photo — every other placeholder in this
 * app is a gradient or a people-free photo, never a fabricated or
 * sourced depiction of a person (see prisma/seed.ts's fallbackSvgBytes
 * and its own comment on why), and this is the single most visible
 * spot on the site to hold that line. If a real, appropriately-licensed
 * photo is ever supplied for this specific spot, swap the content of
 * the card for an <img> — the tilt/spotlight wrapper below doesn't care
 * what's inside it.
 *
 * The tilt/spotlight/parallax are all driven by two CSS custom
 * properties (--px/--py, normalized -0.5..0.5) written straight to the
 * DOM node in the mousemove handler rather than React state, so 60fps
 * pointer movement doesn't churn a re-render every frame — see
 * globals.css's .hero-visual rules for how each layer reads them.
 */
export function HeroVisual() {
  const cardRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--px", String(px));
    card.style.setProperty("--py", String(py));
    card.style.setProperty("--spot-x", `${(px + 0.5) * 100}%`);
    card.style.setProperty("--spot-y", `${(py + 0.5) * 100}%`);
  }

  function handleMouseLeave() {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--px", "0");
    card.style.setProperty("--py", "0");
  }

  return (
    <div
      ref={cardRef}
      className="hero-visual"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-hidden="true"
    >
      <div className="hero-visual-orb hero-visual-orb-a" />
      <div className="hero-visual-orb hero-visual-orb-b" />
      <div className="hero-visual-ring-wrap">
        <div className="hero-visual-ring" />
        <div className="hero-visual-ring hero-visual-ring-inner" />
        <span className="hero-visual-mark">b</span>
      </div>
      <div className="hero-visual-spotlight" />
    </div>
  );
}
