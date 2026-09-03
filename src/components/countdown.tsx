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
  gap: "0.6rem",
  marginTop: "1.75rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

const unitRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
};

const unitStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "0.75rem 0.9rem",
  minWidth: "64px",
  textAlign: "center",
  boxShadow: "var(--glow)",
};

const unitValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.6rem",
  fontWeight: 600,
  lineHeight: 1.1,
};

const unitNameStyle: React.CSSProperties = {
  fontSize: "0.68rem",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: "0.2rem",
};
