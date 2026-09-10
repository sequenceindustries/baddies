"use client";

import { useEffect, useState } from "react";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(target: Date): TimeLeft {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

/**
 * The landing page's launch countdown — one fixed target date (see
 * LAUNCH_DATE below), not "35 days from whenever this page loads": a
 * countdown that resets itself for every visitor would never actually
 * count down. Ticks client-side only (server-rendering a live clock
 * would just mismatch on hydration), so it starts blank for the first
 * paint and fills in once mounted.
 */
export function Countdown({ target, label }: { target: Date; label?: string }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTimeLeft(getTimeLeft(target));
    const id = setInterval(() => setTimeLeft(getTimeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!timeLeft) return <div style={{ ...wrapStyle, visibility: "hidden" }} aria-hidden="true" />;

  const units: [string, number][] = [
    ["Days", timeLeft.days],
    ["Hours", timeLeft.hours],
    ["Minutes", timeLeft.minutes],
    ["Seconds", timeLeft.seconds],
  ];

  return (
    <div style={wrapStyle}>
      {label && <div style={labelStyle}>{label}</div>}
      <div style={unitRowStyle}>
        {units.map(([name, value]) => (
          <div key={name} style={unitStyle}>
            <div style={unitValueStyle}>{String(value).padStart(2, "0")}</div>
            <div style={unitNameStyle}>{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.9rem",
  marginTop: "1.75rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "1.05rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

// Real, confirmed mobile bug: 4 units at their minWidth (96px) plus
// padding and gaps add up to ~475px — wider than a phone viewport (as
// narrow as 375px). Without wrapping, that width forced the *whole*
// page to overflow horizontally (this row sits inside the landing
// page's full-bleed .hero-plain, width:100vw), clipping both these
// numbers and the hero paragraph off both edges with no way to scroll
// to them. flexWrap lets it fall back to a centered 2x2 grid on narrow
// screens instead of forcing one row no matter what.
const unitRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "1.1rem",
};

// Borders removed per product decision — the glow shadow plus the
// surface color are enough to read as a block without a hard edge.
const unitStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "18px",
  padding: "1.1rem 1.35rem",
  minWidth: "96px",
  textAlign: "center",
  boxShadow: "var(--glow)",
};

// 50% bigger than the original 1.6rem, per product decision — this is
// the landing page's launch countdown, meant to be the loudest number
// on the hero.
const unitValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "2.4rem",
  fontWeight: 600,
  lineHeight: 1.1,
};

const unitNameStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: "0.3rem",
};
