"use client";

/**
 * Shared pill-style tab bar (social-feed follow-up, "make the
 * dashboards/settings feel more like social media" via tab/segment
 * navigation, per the user's own answer to a clarifying question).
 * Extracted and generalized from src/app/(creator)/creator-dashboard/
 * page.tsx's own hand-rolled tab bar — same visual language (pill
 * buttons, solid accent fill when active) reused everywhere a page
 * gets tabs, rather than inventing a new look: creator-dashboard
 * itself, src/app/profile/page.tsx, src/app/settings/page.tsx, and
 * src/app/fan-subscriptions/page.tsx.
 */
export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
}

export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: SegmentedTab<T>[];
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={tabBarStyle}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} style={tabButtonStyle(active === t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "0.5rem",
  marginBottom: "1.75rem",
  flexWrap: "wrap",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.5rem 1.1rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--bg)" : "var(--text-muted)",
    border: active ? "none" : "1px solid var(--border)",
  };
}
