"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSession, displayHeadingStyle, SignInGate } from "@/components/ui";

interface CreatorApplication {
  creatorProfileId: string;
  status: string;
  appliedAt: string;
  applicantEmail: string;
  verificationChecks: { type: string; status: string; completedAt: string | null }[];
}

interface ContentQueueItem {
  contentId: string;
  mediaType: string;
  accessLevel: string;
  caption: string | null;
  createdAt: string;
  creatorProfileId: string;
  creatorEmail: string;
  participantCount: number;
}

const TABS = ["Overview", "Members", "Creators", "Applications", "Content", "Payouts", "Audit Log"] as const;
type Tab = (typeof TABS)[number];

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "all", label: "All Time" },
];

interface DayCount {
  date: string;
  count: number;
}

interface CommandCentreData {
  kpis: {
    totalUsers: { value: number; newInRange: number; deltaPct: number | null };
    activeAccounts: { value: number };
    creators: { value: number; newInRange: number; deltaPct: number | null };
    fans: { value: number };
    activeSubscriptions: { value: number };
    revenue: { inRangeUsd: string; allTimeUsd: string; deltaPct: number | null };
    mrrUsd: string;
    content: { value: number; newInRange: number; deltaPct: number | null };
    openIssues: number;
  };
  foundingBaddies: {
    target: number;
    current: number;
    percent: number | null;
    funnel: Record<string, number>;
    conversion: { appliedToApproved: number | null; approvedToVerified: number | null; verifiedToLive: number | null };
    newInRange: number;
    awaitingReview: number;
    onboarding: number;
    readyForLaunch: number;
  };
  actionRequired: { id: string; label: string; count: number; linkTab: Tab | null }[];
  badges: { applications: number; content: number; payouts: number };
  charts: { newUsers: DayCount[]; newCreators: DayCount[]; newApplications: DayCount[]; newContent: DayCount[] };
  recentActivity: { id: string; kind: string; label: string; actor: string | null; timestamp: string }[];
}

// Reorganizes the flat tab bar into the grouped nav a "command centre"
// calls for — but only the tabs that actually exist this phase are
// clickable (no `tab` field). The rest render as a visibly disabled
// "soon" pill rather than linking to a page that isn't built yet
// (Creators/Founding Baddies get their own page in a later phase; today
// they live inside Applications — Revenue and System Health likewise).
interface NavLeaf {
  label: string;
  tab?: Tab;
  badgeKey?: keyof CommandCentreData["badges"];
}
interface NavGroup {
  label: string;
  items: NavLeaf[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "Command Centre", items: [{ label: "Overview", tab: "Overview" }] },
  {
    label: "People",
    items: [
      { label: "Members", tab: "Members" },
      { label: "Creators", tab: "Creators" },
      { label: "Applications", tab: "Applications", badgeKey: "applications" },
    ],
  },
  { label: "Content", items: [{ label: "Content", tab: "Content", badgeKey: "content" }] },
  { label: "Business", items: [{ label: "Payouts", tab: "Payouts", badgeKey: "payouts" }, { label: "Revenue" }] },
  { label: "Insights", items: [{ label: "Audit Log", tab: "Audit Log" }] },
  { label: "System", items: [{ label: "System Health" }] },
];

function NavGroups({ tab, onSelect, badges }: { tab: Tab; onSelect: (t: Tab) => void; badges?: CommandCentreData["badges"] }) {
  return (
    <div style={navGroupsWrapStyle}>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} style={navGroupRowStyle}>
          <span style={navGroupLabelStyle}>{group.label}</span>
          {group.items.map((item) => {
            if (!item.tab) {
              return (
                <span key={item.label} style={tabButtonDisabledStyle}>
                  {item.label} · soon
                </span>
              );
            }
            const count = item.badgeKey && badges ? badges[item.badgeKey] : 0;
            return (
              <button key={item.label} onClick={() => onSelect(item.tab!)} style={item.tab === tab ? tabButtonActiveStyle : tabButtonStyle}>
                {item.label}
                {count > 0 && <span style={navBadgeStyle}>{count}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Tabbed rather than one long scroll — grouped nav (People/Content/
 * Business/Insights/System) with a real Command Centre Overview up
 * front: KPIs, the Founding Baddies funnel (the current priority — see
 * this session's plan file), Action Required, growth charts, and recent
 * activity, all from one GET /api/admin/command-centre call. Every
 * number there is a real query — a metric with nothing behind it reads
 * as 0 or "—", never an invented figure.
 */
export default function AdminDashboardPage() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState<Tab>("Overview");
  const [range, setRange] = useState<RangeKey>("7d");
  const [ccData, setCcData] = useState<CommandCentreData | null>(null);
  const [ccLoading, setCcLoading] = useState(true);
  const [ccError, setCcError] = useState<string | null>(null);
  const [foundingFilter, setFoundingFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    setCcLoading(true);
    fetch(`/api/admin/command-centre?range=${range}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load the command centre.");
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled) {
          setCcData(body);
          setCcError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setCcError(err.message);
      })
      .finally(() => {
        if (!cancelled) setCcLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, user]);

  function goToFoundingStage(status: string) {
    setFoundingFilter(status);
    setTab("Applications");
  }

  if (loading) return <main style={mainStyle} />;

  if (!user) {
    return (
      <SignInGate
        heading="Sign in required"
        message="This page is for admin accounts only. Sign in with an admin account to continue."
        loginHref="/login?intent=admin"
        showJoin={false}
      />
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Admin only</h1>
        <p style={{ color: "var(--text-muted)" }}>Your account doesn&apos;t have admin access.</p>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Baddies Command Centre</h1>
      <NavGroups tab={tab} onSelect={setTab} badges={ccData?.badges} />

      {tab === "Overview" && (
        <OverviewPanel
          data={ccData}
          loading={ccLoading}
          error={ccError}
          range={range}
          onRangeChange={setRange}
          onNavigate={setTab}
          onDrillFounding={goToFoundingStage}
        />
      )}
      {tab === "Members" && <MembersPanel />}
      {tab === "Creators" && <MembersPanel lockedRole="CREATOR" />}
      {tab === "Applications" && (
        <>
          <FoundingApplicationsQueue statusFilter={foundingFilter} onClearFilter={() => setFoundingFilter(null)} />
          <CreatorQueue />
        </>
      )}
      {tab === "Content" && (
        <>
          <ContentQueue />
          <ContentLibrary />
        </>
      )}
      {tab === "Payouts" && <PayoutQueue />}
      {tab === "Audit Log" && <AuditLogPanel />}
    </main>
  );
}

// =========================================================================
// Overview — stat grid
// =========================================================================

function money(usd: string): string {
  const n = Number(usd);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Same 9 stages as the API's FOUNDING_STAGE_ORDER (kept in sync by
// hand — small, stable list) and FOUNDING_STATUSES below (the status
// dropdown) — CONTENT_READY sits between ONBOARDING and LIVE.
const FOUNDING_FUNNEL_STAGES = [
  "APPLIED",
  "REVIEWED",
  "APPROVED",
  "VERIFICATION_PENDING",
  "VERIFIED",
  "ONBOARDING",
  "CONTENT_READY",
  "LIVE",
  "REJECTED",
] as const;

function OverviewPanel({
  data,
  loading,
  error,
  range,
  onRangeChange,
  onNavigate,
  onDrillFounding,
}: {
  data: CommandCentreData | null;
  loading: boolean;
  error: string | null;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  onNavigate: (tab: Tab) => void;
  onDrillFounding: (status: string) => void;
}) {
  return (
    <section>
      <div style={commandCentreHeaderStyle}>
        <p style={mutedSmallStyle}>What&apos;s happening across the platform, right now.</p>
        <div style={rangeSelectorStyle}>
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => onRangeChange(opt.key)} style={opt.key === range ? tabButtonActiveStyle : tabButtonStyle}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data && (
        <>
          {/* Headline row — the numbers an admin checks first. Fewer,
              larger cards than a wall of equally-weighted stats;
              clickable where a real destination exists. */}
          <div style={heroStatGridStyle}>
            <KpiCard
              label="Total users"
              value={data.kpis.totalUsers.value.toLocaleString()}
              newInRange={data.kpis.totalUsers.newInRange}
              deltaPct={data.kpis.totalUsers.deltaPct}
              onClick={() => onNavigate("Members")}
            />
            <KpiCard
              label="Creators"
              value={data.kpis.creators.value.toLocaleString()}
              newInRange={data.kpis.creators.newInRange}
              deltaPct={data.kpis.creators.deltaPct}
              onClick={() => onNavigate("Creators")}
            />
            <KpiCard label="Active subscriptions" value={data.kpis.activeSubscriptions.value.toLocaleString()} />
            <KpiCard
              label="Revenue"
              value={money(data.kpis.revenue.inRangeUsd)}
              caption={`${money(data.kpis.revenue.allTimeUsd)} all-time`}
            />
            <KpiCard
              label="Content"
              value={data.kpis.content.value.toLocaleString()}
              newInRange={data.kpis.content.newInRange}
              deltaPct={data.kpis.content.deltaPct}
              onClick={() => onNavigate("Content")}
            />
            <KpiCard label="Open issues" value={data.kpis.openIssues.toLocaleString()} alert={data.kpis.openIssues > 0} />
          </div>

          <FoundingBaddiesSection data={data.foundingBaddies} onDrill={onDrillFounding} />
          <ActionRequiredSection items={data.actionRequired} onNavigate={onNavigate} />

          <section style={{ marginBottom: "2.5rem" }}>
            <h2 style={sectionHeadingStyle}>Growth</h2>
            <div style={chartGridStyle}>
              <GrowthChart title="New users" data={data.charts.newUsers} />
              <GrowthChart title="New creators" data={data.charts.newCreators} />
              <GrowthChart title="Founding Baddie applications" data={data.charts.newApplications} />
              <GrowthChart title="New content" data={data.charts.newContent} />
            </div>
            {/* No revenue chart — nothing to chart yet (see the Revenue
                KPI card above). It appears here on its own once there's
                real ledger activity to plot. */}
            <p style={mutedSmallStyle}>Revenue: {money(data.kpis.revenue.allTimeUsd)} all-time.</p>
          </section>

          <RecentActivitySection items={data.recentActivity} />
        </>
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  caption,
  newInRange,
  deltaPct,
  onClick,
  alert,
}: {
  label: string;
  value: string;
  caption?: string;
  newInRange?: number;
  deltaPct?: number | null;
  onClick?: () => void;
  alert?: boolean;
}) {
  const hasDelta = newInRange !== undefined || (deltaPct !== undefined && deltaPct !== null);
  return (
    <div
      style={{ ...heroStatCardStyle, borderColor: alert ? "var(--danger)" : "var(--border)", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div style={heroStatValueStyle}>{value}</div>
      <div style={mutedSmallStyle}>{label}</div>
      {caption && <div style={mutedSmallStyle}>{caption}</div>}
      {hasDelta && (
        <div style={{ ...mutedSmallStyle, color: "var(--text)" }}>
          {newInRange !== undefined && `+${newInRange} this period `}
          {deltaPct !== undefined && deltaPct !== null && (
            <span style={{ color: deltaPct >= 0 ? "var(--success)" : "var(--danger)" }}>
              {deltaPct >= 0 ? "↑" : "↓"} {Math.abs(deltaPct)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FoundingBaddiesSection({
  data,
  onDrill,
}: {
  data: CommandCentreData["foundingBaddies"];
  onDrill: (status: string) => void;
}) {
  const maxCount = Math.max(1, ...FOUNDING_FUNNEL_STAGES.map((s) => data.funnel[s] ?? 0));
  const pct = data.percent ?? 0;

  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2 style={sectionHeadingStyle}>Founding Baddies Command Centre</h2>

      <div style={foundingProgressWrapStyle}>
        <div style={foundingProgressBarOuterStyle}>
          <div style={{ ...foundingProgressBarInnerStyle, width: `${Math.min(100, pct)}%` }} />
        </div>
        <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          {data.current} / {data.target}{" "}
          <span style={{ color: "var(--accent)" }}>{data.percent !== null ? `${data.percent}%` : "—"}</span>
          <span style={{ ...mutedSmallStyle, display: "inline" }}> toward target</span>
        </div>
      </div>

      <div style={funnelWrapStyle}>
        {FOUNDING_FUNNEL_STAGES.map((stage) => {
          const count = data.funnel[stage] ?? 0;
          return (
            <div key={stage} style={funnelRowStyle} onClick={() => onDrill(stage)} role="button">
              <span style={funnelLabelStyle}>{humanizeKey(stage)}</span>
              <div style={funnelBarOuterStyle}>
                <div
                  style={{
                    ...funnelBarInnerStyle,
                    width: `${(count / maxCount) * 100}%`,
                    background: stage === "REJECTED" ? "#f0685c" : "#3b82f6",
                  }}
                />
              </div>
              <span style={funnelCountStyle}>{count}</span>
            </div>
          );
        })}
      </div>

      <StatGroup title="Recruitment funnel">
        <Stat label="Applied → Approved" value={data.conversion.appliedToApproved !== null ? `${data.conversion.appliedToApproved}%` : "—"} />
        <Stat label="Approved → Verified" value={data.conversion.approvedToVerified !== null ? `${data.conversion.approvedToVerified}%` : "—"} />
        <Stat label="Verified → Live" value={data.conversion.verifiedToLive !== null ? `${data.conversion.verifiedToLive}%` : "—"} />
        <Stat label="New applications" value={data.newInRange} />
        <Stat label="Awaiting review" value={data.awaitingReview} alert={data.awaitingReview > 0} />
        <Stat label="Onboarding" value={data.onboarding} />
        <Stat label="Ready for launch" value={data.readyForLaunch} />
      </StatGroup>
    </section>
  );
}

function ActionRequiredSection({
  items,
  onNavigate,
}: {
  items: CommandCentreData["actionRequired"];
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2 style={sectionHeadingStyle}>Action required</h2>
      {items.length === 0 ? (
        <p style={{ color: "var(--success)", fontWeight: 600 }}>You&apos;re all caught up.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{ ...actionItemStyle, cursor: item.linkTab ? "pointer" : "default" }}
              onClick={item.linkTab ? () => onNavigate(item.linkTab!) : undefined}
              role={item.linkTab ? "button" : undefined}
            >
              <span style={actionCountStyle}>{item.count}</span>
              <span>{item.label}</span>
              {item.linkTab && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>→</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GrowthChart({ title, data }: { title: string; data: DayCount[] }) {
  const hasData = data.some((d) => d.count > 0);
  return (
    <div style={chartCardStyle}>
      <div style={statGroupHeadingStyle}>{title}</div>
      {!hasData ? (
        <p style={mutedSmallStyle}>No data yet for this range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c2c36" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a19dab" }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#a19dab" }} width={28} />
            <Tooltip contentStyle={{ background: "#212129", border: "1px solid #2c2c36", fontSize: "0.78rem", color: "#f5f2ec" }} />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function RecentActivitySection({ items }: { items: CommandCentreData["recentActivity"] }) {
  return (
    <section>
      <h2 style={sectionHeadingStyle}>Recent activity</h2>
      {items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {items.map((item) => (
            <div key={item.id} style={auditRowStyle}>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{item.label}</span>
              <span style={mutedSmallStyle}>
                {item.actor ?? "system"} · {new Date(item.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <h3 style={statGroupHeadingStyle}>{title}</h3>
      <div style={statGridStyle}>{children}</div>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div style={{ ...statCardStyle, borderColor: alert ? "var(--danger)" : "var(--border)" }}>
      <div style={statValueStyle}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div style={mutedSmallStyle}>{label}</div>
    </div>
  );
}

// =========================================================================
// Members — searchable/paginated directory (replaces the old
// exact-email-only lookup; suspend/ban act directly on table rows)
// =========================================================================

interface MemberRow {
  userId: string;
  email: string;
  role: string;
  displayName: string | null;
  isActive: boolean;
  suspendedAt: string | null;
  creatorProfileStatus: string | null;
  createdAt: string;
  lastSessionAt: string | null;
  foundingBaddie: boolean;
  creatorStats: { contentCount: number; activeSubscribers: number; revenueUsd: string } | null;
  fanStats: { purchasesUsd: string; tipsUsd: string } | null;
}

/**
 * Members and Creators are the same list — a creator is just a User
 * row with a creatorProfile. `lockedRole="CREATOR"` (the Creators tab)
 * hides the role dropdown, forces the filter, and always shows the
 * creator performance columns; the Members tab shows those columns
 * only for rows that happen to be creators. Both open the same
 * MemberDetailView for a clicked row — no separate Creators UI.
 */
function MembersPanel({ lockedRole }: { lockedRole?: "CREATOR" }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(lockedRole ?? "");
  const [status, setStatus] = useState("");
  const [founding, setFounding] = useState(false);
  const [verified, setVerified] = useState(false);
  const [newDays, setNewDays] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  function buildParams(cursorValue?: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (lockedRole) params.set("role", lockedRole);
    else if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (founding) params.set("founding", "true");
    if (verified) params.set("verified", "true");
    if (newDays) params.set("newDays", newDays);
    if (cursorValue) params.set("cursor", cursorValue);
    return params.toString();
  }

  function reload() {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/users?${buildParams()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load members.");
        }
        return r.json();
      })
      .then((body) => {
        setMembers(body.users ?? []);
        setCursor(body.nextCursor ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetch(`/api/admin/users?${buildParams(cursor)}`);
    setLoadingMore(false);
    if (!res.ok) return;
    const body = await res.json();
    setMembers((prev) => [...prev, ...(body.users ?? [])]);
    setCursor(body.nextCursor ?? null);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [lockedRole]);

  async function act(userId: string, action: "suspend" | "ban") {
    const target = members.find((m) => m.userId === userId);
    if (!target) return;
    if (!window.confirm(`${action === "ban" ? "Ban" : "Suspend"} ${target.email}?`)) return;
    setBusyId(userId);
    const res = await fetch(`/api/admin/users/${userId}/${action}`, { method: "POST" });
    setBusyId(null);
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, isActive: false } : m)));
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? `${action} failed.`);
    }
  }

  if (selectedUserId) {
    return <MemberDetailView userId={selectedUserId} onBack={() => setSelectedUserId(null)} onChanged={reload} />;
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>{lockedRole === "CREATOR" ? "Creators" : "Members"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reload();
        }}
        style={memberFilterBarStyle}
      >
        <input
          style={memberSearchInputStyle}
          placeholder="Search by email or display name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!lockedRole && (
          <select style={statusSelectStyle} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="FAN">Fan</option>
            <option value="CREATOR">Creator</option>
            <option value="ADMIN">Admin</option>
          </select>
        )}
        <select style={statusSelectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Active + suspended</option>
          <option value="active">Active only</option>
          <option value="suspended">Suspended only</option>
        </select>
        <select style={statusSelectStyle} value={newDays} onChange={(e) => setNewDays(e.target.value)}>
          <option value="">Any join date</option>
          <option value="7">New (7d)</option>
          <option value="30">New (30d)</option>
        </select>
        <label style={filterCheckboxLabelStyle}>
          <input type="checkbox" checked={founding} onChange={(e) => setFounding(e.target.checked)} /> Founding Baddie
        </label>
        {(lockedRole === "CREATOR" || role === "CREATOR") && (
          <label style={filterCheckboxLabelStyle}>
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verified only
          </label>
        )}
        <button type="submit" style={approveButtonStyle}>
          Search
        </button>
      </form>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : members.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No {lockedRole === "CREATOR" ? "creators" : "members"} match.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {members.map((m) => (
              <div key={m.userId} style={rowCardStyle}>
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setSelectedUserId(m.userId)} role="button">
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    {m.displayName ?? m.email} · {humanizeKey(m.role)}
                    {m.foundingBaddie && <span style={foundingBadgeStyle}>Founding Baddie</span>}
                  </div>
                  <div style={mutedSmallStyle}>
                    {m.email} · {m.isActive ? "active" : "inactive"}
                    {m.creatorProfileStatus ? ` · creator: ${humanizeKey(m.creatorProfileStatus)}` : ""} · joined{" "}
                    {new Date(m.createdAt).toLocaleDateString()}
                    {m.lastSessionAt ? ` · last session ${new Date(m.lastSessionAt).toLocaleDateString()}` : " · never signed in"}
                  </div>
                  {m.creatorStats && (
                    <div style={mutedSmallStyle}>
                      {m.creatorStats.contentCount} content · {m.creatorStats.activeSubscribers} subscribers ·{" "}
                      {money(m.creatorStats.revenueUsd)} earned
                    </div>
                  )}
                  {m.fanStats && (Number(m.fanStats.purchasesUsd) > 0 || Number(m.fanStats.tipsUsd) > 0) && (
                    <div style={mutedSmallStyle}>
                      {money(m.fanStats.purchasesUsd)} purchases · {money(m.fanStats.tipsUsd)} tips
                    </div>
                  )}
                </div>
                {m.role !== "ADMIN" && m.isActive && (
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    <button onClick={() => act(m.userId, "suspend")} disabled={busyId === m.userId} style={rejectButtonStyle}>
                      Suspend
                    </button>
                    <button onClick={() => act(m.userId, "ban")} disabled={busyId === m.userId} style={rejectButtonStyle}>
                      Ban
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {cursor && (
            <button onClick={loadMore} disabled={loadingMore} style={{ ...approveButtonStyle, marginTop: "1rem" }}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

interface MemberDetailData {
  userId: string;
  email: string;
  role: string;
  displayName: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  isActive: boolean;
  suspendedAt: string | null;
  ageVerified: boolean;
  createdAt: string;
  lastSession: { at: string; ipAddress: string | null } | null;
  foundingApplication: { id: string; status: string; appliedAt: string } | null;
  creatorProfile: {
    status: string;
    appliedAt: string;
    approvedAt: string | null;
    vvipPriceOverride: string | null;
    isLive: boolean;
    contentCount: number;
    activeSubscribers: number;
    revenueUsd: string;
    recentContent: { id: string; mediaType: string; accessLevel: string; status: string; createdAt: string }[];
  } | null;
  fanFinancials: {
    purchasesUsd: string;
    tipsUsd: string;
    activeCreatorSubscriptions: number;
    activeVipPass: { priceUsd: string; currentPeriodEnd: string } | null;
  } | null;
  recentActivity: {
    id: string;
    action: string;
    actorEmail: string;
    isActor: boolean;
    targetType: string | null;
    targetId: string | null;
    createdAt: string;
  }[];
  moderation: {
    reportsFiled: { id: string; reason: string; createdAt: string }[];
    reportsAgainst: { id: string; reason: string; createdAt: string }[];
  };
}

function MemberDetailView({ userId, onBack, onChanged }: { userId: string; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/members/${userId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load member.");
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function act(action: "suspend" | "ban") {
    if (!data) return;
    if (!window.confirm(`${action === "ban" ? "Ban" : "Suspend"} ${data.email}?`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${data.userId}/${action}`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setData({ ...data, isActive: false });
      onChanged();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? `${action} failed.`);
    }
  }

  return (
    <section>
      <button onClick={onBack} style={{ ...tabButtonStyle, marginBottom: "1.25rem" }}>
        ← Back to list
      </button>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ ...sectionHeadingStyle, margin: "0 0 0.3rem" }}>
                {data.displayName ?? data.email}
                {data.foundingApplication && <span style={foundingBadgeStyle}>Founding Baddie</span>}
              </h2>
              <div style={mutedSmallStyle}>
                {data.email} · {humanizeKey(data.role)} · {data.isActive ? "active" : "inactive"} · joined{" "}
                {new Date(data.createdAt).toLocaleDateString()}
                {data.city || data.country ? ` · ${[data.city, data.country].filter(Boolean).join(", ")}` : ""}
              </div>
              <div style={mutedSmallStyle}>
                {data.lastSession
                  ? `Last session ${new Date(data.lastSession.at).toLocaleString()}${data.lastSession.ipAddress ? ` from ${data.lastSession.ipAddress}` : ""}`
                  : "Never signed in"}
              </div>
              {data.bio && <p style={{ fontSize: "0.85rem", marginTop: "0.5rem", maxWidth: "480px" }}>{data.bio}</p>}
            </div>
            {data.role !== "ADMIN" && data.isActive && (
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button onClick={() => act("suspend")} disabled={busy} style={rejectButtonStyle}>
                  Suspend
                </button>
                <button onClick={() => act("ban")} disabled={busy} style={rejectButtonStyle}>
                  Ban
                </button>
              </div>
            )}
          </div>

          {data.foundingApplication && (
            <StatGroup title="Founding Baddie application">
              <Stat label="Status" value={humanizeKey(data.foundingApplication.status)} />
              <Stat label="Applied" value={new Date(data.foundingApplication.appliedAt).toLocaleDateString()} />
            </StatGroup>
          )}

          {data.creatorProfile && (
            <>
              <StatGroup title="Creator performance">
                <Stat label="Status" value={humanizeKey(data.creatorProfile.status)} />
                <Stat label="Content" value={data.creatorProfile.contentCount} />
                <Stat label="Active subscribers" value={data.creatorProfile.activeSubscribers} />
                <Stat label="Revenue (earned)" value={money(data.creatorProfile.revenueUsd)} />
                <Stat label="Live now" value={data.creatorProfile.isLive ? "Yes" : "No"} />
                {data.creatorProfile.approvedAt && (
                  <Stat label="Approved" value={new Date(data.creatorProfile.approvedAt).toLocaleDateString()} />
                )}
              </StatGroup>
              {data.creatorProfile.recentContent.length > 0 && (
                <div style={{ marginBottom: "2rem" }}>
                  <h3 style={statGroupHeadingStyle}>Recent content</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {data.creatorProfile.recentContent.map((c) => (
                      <div key={c.id} style={auditRowStyle}>
                        <span style={{ fontWeight: 600 }}>
                          {humanizeKey(c.mediaType)} · {humanizeKey(c.accessLevel)}
                        </span>
                        <span style={mutedSmallStyle}>
                          {humanizeKey(c.status)} · {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {data.fanFinancials && (
            <StatGroup title="Financials">
              <Stat label="Purchases" value={money(data.fanFinancials.purchasesUsd)} />
              <Stat label="Tips" value={money(data.fanFinancials.tipsUsd)} />
              <Stat label="Active creator subscriptions" value={data.fanFinancials.activeCreatorSubscriptions} />
              <Stat label="VIP pass" value={data.fanFinancials.activeVipPass ? money(data.fanFinancials.activeVipPass.priceUsd) + "/mo" : "None"} />
            </StatGroup>
          )}

          {(data.moderation.reportsFiled.length > 0 || data.moderation.reportsAgainst.length > 0) && (
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={statGroupHeadingStyle}>Moderation flags</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {data.moderation.reportsAgainst.map((r) => (
                  <div key={r.id} style={{ ...auditRowStyle, borderColor: "var(--danger)" }}>
                    <span style={{ fontWeight: 600, color: "var(--danger)" }}>Reported: {humanizeKey(r.reason)}</span>
                    <span style={mutedSmallStyle}>{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {data.moderation.reportsFiled.map((r) => (
                  <div key={r.id} style={auditRowStyle}>
                    <span style={{ fontWeight: 600 }}>Filed a report: {humanizeKey(r.reason)}</span>
                    <span style={mutedSmallStyle}>{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={statGroupHeadingStyle}>Recent activity</h3>
            {data.recentActivity.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>Nothing yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {data.recentActivity.map((a) => (
                  <div key={a.id} style={auditRowStyle}>
                    <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{a.action.replace(/[._]/g, " ")}</span>
                    <span style={mutedSmallStyle}>
                      {a.isActor ? "by this member" : `on this member (by ${a.actorEmail})`} ·{" "}
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

interface PlatformEntryView {
  category: "social" | "creator";
  platform: string;
  handle: string;
  link: string;
  followers: string;
}

interface FoundingApplicationRow {
  id: string;
  fullName: string;
  stageName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  platforms: PlatformEntryView[];
  audienceSize: string | null;
  monetisationExperience: string | null;
  creatingSince: string | null;
  currentlyMonetising: boolean | null;
  whyJoinBaddies: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
}

const FOUNDING_STATUSES = [
  "APPLIED",
  "REVIEWED",
  "APPROVED",
  "VERIFICATION_PENDING",
  "VERIFIED",
  "ONBOARDING",
  "CONTENT_READY",
  "LIVE",
  "REJECTED",
] as const;

/**
 * Founding Baddies campaign applications (§ Founding Baddies Sprint,
 * Phase 5) — top of the Applications tab since recruiting the first
 * cohort is this sprint's whole point. One generic status dropdown per
 * row (FOUNDING_STATUSES) rather than approve/reject buttons — there
 * are 9 real pipeline stages here, not a binary decision.
 *
 * statusFilter/onClearFilter let the Command Centre's funnel drill
 * through to "just this stage" — filtered client-side (the queue
 * already loads every application, no need for a server round trip
 * for what's ultimately a small list at this stage of the business).
 */
function FoundingApplicationsQueue({
  statusFilter,
  onClearFilter,
}: {
  statusFilter?: string | null;
  onClearFilter?: () => void;
}) {
  const [applications, setApplications] = useState<FoundingApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    fetch("/api/admin/founding-applications")
      .then((r) => (r.ok ? r.json() : { applications: [] }))
      .then((body) => setApplications(body.applications ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  const visibleApplications = statusFilter ? applications.filter((a) => a.status === statusFilter) : applications;

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/founding-applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Update failed.");
    }
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <h2 style={{ ...sectionHeadingStyle, margin: 0 }}>Founding baddies applications</h2>
        {statusFilter && (
          <button onClick={onClearFilter} style={filterChipStyle}>
            {humanizeKey(statusFilter)} × clear
          </button>
        )}
      </div>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : visibleApplications.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{statusFilter ? "None at this stage." : "No applications yet."}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {visibleApplications.map((app) => {
            const expanded = expandedId === app.id;
            return (
              <div key={app.id} style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch" }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", gap: "1rem", cursor: "pointer" }}
                  onClick={() => setExpandedId(expanded ? null : app.id)}
                >
                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {app.stageName} · {app.fullName}
                    </div>
                    <div style={mutedSmallStyle}>
                      {app.email} · {app.city}, {app.country} · applied{" "}
                      {new Date(app.createdAt).toLocaleDateString()}
                    </div>
                    <div style={mutedSmallStyle}>
                      {app.platforms.length} platform{app.platforms.length === 1 ? "" : "s"}:{" "}
                      {app.platforms.map((p) => p.platform).join(", ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                    <select
                      value={app.status}
                      disabled={busyId === app.id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => changeStatus(app.id, e.target.value)}
                      style={statusSelectStyle}
                    >
                      {FOUNDING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {expanded && (
                  <div style={{ marginTop: "0.9rem", paddingTop: "0.9rem", borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                      <strong>Phone:</strong> {app.phone}
                    </div>
                    {app.platforms.map((p, i) => (
                      <div key={i} style={mutedSmallStyle}>
                        {p.category === "creator" ? "Creator platform" : "Social"} · {p.platform}
                        {p.handle ? ` · @${p.handle}` : ""}
                        {p.followers ? ` · ${p.followers} followers` : ""}
                        {p.link ? (
                          <>
                            {" · "}
                            <a href={p.link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                              link
                            </a>
                          </>
                        ) : null}
                      </div>
                    ))}
                    {app.audienceSize && (
                      <div style={{ fontSize: "0.85rem", marginTop: "0.6rem" }}>
                        <strong>Audience:</strong> {app.audienceSize}
                      </div>
                    )}
                    {app.creatingSince && (
                      <div style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
                        <strong>Creating since:</strong> {app.creatingSince}
                      </div>
                    )}
                    {app.currentlyMonetising !== null && (
                      <div style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
                        <strong>Currently monetising:</strong> {app.currentlyMonetising ? "Yes" : "Not yet"}
                      </div>
                    )}
                    {app.monetisationExperience && (
                      <div style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
                        <strong>Monetisation experience:</strong> {app.monetisationExperience}
                      </div>
                    )}
                    {/* whyJoinBaddies is no longer a form question (see
                        founding-baddies/page.tsx) — this stays conditional
                        so it still shows for applications submitted before
                        that question was removed, without an empty "Why
                        baddies:" line on every application after. */}
                    {app.whyJoinBaddies && (
                      <div style={{ fontSize: "0.85rem", marginTop: "0.6rem" }}>
                        <strong>Why baddies:</strong> {app.whyJoinBaddies}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface PayoutRequest {
  payoutId: string;
  creatorEmail: string;
  amountUsd: number;
  requestedAt: string;
}

function PayoutQueue() {
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    fetch("/api/admin/payouts")
      .then((r) => (r.ok ? r.json() : { payouts: [] }))
      .then((body) => setPayouts(body.payouts ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function approve(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/payouts/${id}/approve`, { method: "POST" });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Approve failed.");
    }
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2 style={sectionHeadingStyle}>Payout requests</h2>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : payouts.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {payouts.map((p) => (
            <div key={p.payoutId} style={rowCardStyle}>
              <div>
                <div style={{ fontSize: "0.9rem" }}>
                  {p.creatorEmail} · ${p.amountUsd.toFixed(2)}
                </div>
                <div style={mutedSmallStyle}>requested {new Date(p.requestedAt).toLocaleString()}</div>
              </div>
              <button onClick={() => approve(p.payoutId)} disabled={busyId === p.payoutId} style={approveButtonStyle}>
                {busyId === p.payoutId ? "..." : "Approve"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface AuditLogEntry {
  id: string;
  action: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

function AuditLogPanel() {
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  function buildParams(cursorValue?: string) {
    const params = new URLSearchParams();
    if (actionFilter.trim()) params.set("action", actionFilter.trim());
    if (actorFilter.trim()) params.set("actor", actorFilter.trim());
    if (cursorValue) params.set("cursor", cursorValue);
    return params.toString();
  }

  function reload() {
    setLoading(true);
    fetch(`/api/admin/audit-log?${buildParams()}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((body) => {
        setEntries(body.entries ?? []);
        setCursor(body.nextCursor ?? null);
      })
      .finally(() => setLoading(false));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetch(`/api/admin/audit-log?${buildParams(cursor)}`);
    setLoadingMore(false);
    if (!res.ok) return;
    const body = await res.json();
    setEntries((prev) => [...prev, ...(body.entries ?? [])]);
    setCursor(body.nextCursor ?? null);
  }

  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Audit log</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reload();
        }}
        style={memberFilterBarStyle}
      >
        <input
          style={memberSearchInputStyle}
          placeholder="Filter by action prefix (e.g. creator.)..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <input
          style={memberSearchInputStyle}
          placeholder="Filter by actor email..."
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
        />
        <button type="submit" style={approveButtonStyle}>
          Filter
        </button>
      </form>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No activity matches.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {entries.map((e) => (
              <div key={e.id} style={auditRowStyle}>
                <span style={{ fontWeight: 600 }}>{e.action}</span>
                <span style={mutedSmallStyle}>
                  {e.actorEmail ?? "system"}
                  {e.targetType ? ` · ${e.targetType}:${e.targetId}` : ""} ·{" "}
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {cursor && (
            <button onClick={loadMore} disabled={loadingMore} style={{ ...approveButtonStyle, marginTop: "1rem" }}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function CreatorQueue() {
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    fetch("/api/admin/creators")
      .then((r) => (r.ok ? r.json() : { applications: [] }))
      .then((body) => setApplications(body.applications ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function approve(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/creators/${id}/approve`, { method: "POST" });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Approve failed.");
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Reason for rejecting this application?");
    if (!reason) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/creators/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Reject failed.");
    }
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2 style={sectionHeadingStyle}>Creator applications</h2>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : applications.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {applications.map((app) => (
            <div key={app.creatorProfileId} style={rowCardStyle}>
              <div>
                <div style={{ fontSize: "0.9rem" }}>{app.applicantEmail}</div>
                <div style={mutedSmallStyle}>
                  {app.status} · applied {new Date(app.appliedAt).toLocaleDateString()}
                </div>
                <div style={mutedSmallStyle}>
                  {app.verificationChecks.length === 0
                    ? "No verification checks started"
                    : app.verificationChecks.map((c) => `${c.type}: ${c.status}`).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                {app.status === "UNDER_REVIEW" && (
                  <button onClick={() => approve(app.creatorProfileId)} disabled={busyId === app.creatorProfileId} style={approveButtonStyle}>
                    Approve
                  </button>
                )}
                <button onClick={() => reject(app.creatorProfileId)} disabled={busyId === app.creatorProfileId} style={rejectButtonStyle}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ContentQueue() {
  const [queue, setQueue] = useState<ContentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    fetch("/api/admin/content")
      .then((r) => (r.ok ? r.json() : { queue: [] }))
      .then((body) => setQueue(body.queue ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function approve(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/content/${id}/approve`, { method: "POST" });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Approve failed.");
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Reason for rejecting this content?");
    if (!reason) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/content/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Reject failed.");
    }
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2 style={sectionHeadingStyle}>Content moderation</h2>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : queue.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          Nothing pending — uploads don&apos;t require review before going live by default; this fills only when a
          report pulls something back for a re-review.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {queue.map((item) => (
            <div key={item.contentId} style={rowCardStyle}>
              <div>
                <div style={{ fontSize: "0.9rem" }}>{item.caption || "(no caption)"}</div>
                <div style={mutedSmallStyle}>
                  {item.creatorEmail} · {item.mediaType} · {item.accessLevel}
                  {item.participantCount > 0 ? ` · ${item.participantCount} participant(s)` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button onClick={() => approve(item.contentId)} disabled={busyId === item.contentId} style={approveButtonStyle}>
                  Approve
                </button>
                <button onClick={() => reject(item.contentId)} disabled={busyId === item.contentId} style={rejectButtonStyle}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface ContentLibraryItem {
  contentId: string;
  mediaType: string;
  accessLevel: string;
  status: string;
  caption: string | null;
  createdAt: string;
  creatorProfileId: string;
  creatorEmail: string;
}

interface ContentStatusCounts {
  total: number;
  DRAFT: number;
  UPLOADED: number;
  PROCESSING: number;
  PENDING_REVIEW: number;
  APPROVED: number;
  REJECTED: number;
  REMOVED: number;
}

const CONTENT_STATUSES = ["DRAFT", "UPLOADED", "PROCESSING", "PENDING_REVIEW", "APPROVED", "REJECTED", "REMOVED"] as const;
const MEDIA_TYPES = ["IMAGE", "VIDEO", "AUDIO"] as const;
const ACCESS_LEVELS = ["FREE", "VIP", "VVIP", "PPV"] as const;

/**
 * The full content directory — every item regardless of status,
 * alongside ContentQueue's focused "needs review right now" list
 * (unchanged, above this). Same shape as Members-vs-Creators in Phase
 * 2: a queue + a searchable library, not a rebuild of the queue.
 */
function ContentLibrary() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [mediaType, setMediaType] = useState("");
  const [accessLevel, setAccessLevel] = useState("");
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<ContentStatusCounts | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function buildParams(cursorValue?: string) {
    const params = new URLSearchParams();
    params.set("status", status || "all");
    if (query.trim()) params.set("query", query.trim());
    if (mediaType) params.set("mediaType", mediaType);
    if (accessLevel) params.set("accessLevel", accessLevel);
    if (cursorValue) params.set("cursor", cursorValue);
    return params.toString();
  }

  function reload() {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/content?${buildParams()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load content.");
        }
        return r.json();
      })
      .then((body) => {
        setItems(body.items ?? []);
        setCursor(body.nextCursor ?? null);
        setStatusCounts(body.statusCounts ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetch(`/api/admin/content?${buildParams(cursor)}`);
    setLoadingMore(false);
    if (!res.ok) return;
    const body = await res.json();
    setItems((prev) => [...prev, ...(body.items ?? [])]);
    setCursor(body.nextCursor ?? null);
  }

  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedId) {
    return (
      <ContentDetailView
        contentId={selectedId}
        onBack={() => {
          setSelectedId(null);
          reload();
        }}
      />
    );
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Content library</h2>
      {statusCounts && (
        <div style={{ ...statGridStyle, marginBottom: "1.25rem" }}>
          <Stat label="Total" value={statusCounts.total} />
          {CONTENT_STATUSES.map((s) => (
            <Stat key={s} label={humanizeKey(s)} value={statusCounts[s]} alert={s === "PENDING_REVIEW" && statusCounts[s] > 0} />
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reload();
        }}
        style={memberFilterBarStyle}
      >
        <input
          style={memberSearchInputStyle}
          placeholder="Search caption or creator email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select style={statusSelectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {CONTENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanizeKey(s)}
            </option>
          ))}
        </select>
        <select style={statusSelectStyle} value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
          <option value="">All media types</option>
          {MEDIA_TYPES.map((m) => (
            <option key={m} value={m}>
              {humanizeKey(m)}
            </option>
          ))}
        </select>
        <select style={statusSelectStyle} value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)}>
          <option value="">All access levels</option>
          {ACCESS_LEVELS.map((a) => (
            <option key={a} value={a}>
              {humanizeKey(a)}
            </option>
          ))}
        </select>
        <button type="submit" style={approveButtonStyle}>
          Search
        </button>
      </form>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No content matches.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {items.map((item) => (
              <div key={item.contentId} style={rowCardStyle}>
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setSelectedId(item.contentId)} role="button">
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.caption || "(no caption)"}</div>
                  <div style={mutedSmallStyle}>
                    {item.creatorEmail} · {humanizeKey(item.mediaType)} · {humanizeKey(item.accessLevel)} ·{" "}
                    {humanizeKey(item.status)} · {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {cursor && (
            <button onClick={loadMore} disabled={loadingMore} style={{ ...approveButtonStyle, marginTop: "1rem" }}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

interface ContentDetailData {
  contentId: string;
  mediaType: string;
  accessLevel: string;
  priceUsd: string | null;
  caption: string | null;
  status: string;
  moderationStatus: string;
  contentHash: string | null;
  publishedAt: string | null;
  createdAt: string;
  creatorProfileId: string;
  creatorEmail: string;
  participantCount: number;
  likeCount: number;
  purchaseCount: number;
  moderationHistory: { id: string; action: string; actorEmail: string; metadata: unknown; createdAt: string }[];
  reports: { id: string; reason: string; details: string | null; createdAt: string }[];
}

function ContentDetailView({ contentId, onBack }: { contentId: string; onBack: () => void }) {
  const [data, setData] = useState<ContentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/content/${contentId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load content.");
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  async function remove() {
    if (!data) return;
    const reason = window.prompt("Reason for removing this content?");
    if (!reason) return;
    setBusy(true);
    const res = await fetch(`/api/admin/content/${data.contentId}/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (res.ok) {
      setData({ ...data, status: "REMOVED", moderationStatus: "REMOVED" });
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Remove failed.");
    }
  }

  return (
    <section>
      <button onClick={onBack} style={{ ...tabButtonStyle, marginBottom: "1.25rem" }}>
        ← Back to list
      </button>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ ...sectionHeadingStyle, margin: "0 0 0.3rem" }}>{data.caption || "(no caption)"}</h2>
              <div style={mutedSmallStyle}>
                {data.creatorEmail} · {humanizeKey(data.mediaType)} · {humanizeKey(data.accessLevel)} · uploaded{" "}
                {new Date(data.createdAt).toLocaleString()}
              </div>
              {data.publishedAt && <div style={mutedSmallStyle}>Published {new Date(data.publishedAt).toLocaleString()}</div>}
            </div>
            {data.status === "APPROVED" && (
              <button onClick={remove} disabled={busy} style={rejectButtonStyle}>
                Remove
              </button>
            )}
          </div>

          <StatGroup title="Status">
            <Stat label="Status" value={humanizeKey(data.status)} />
            <Stat label="Moderation status" value={humanizeKey(data.moderationStatus)} />
            <Stat label="Participants" value={data.participantCount} />
            <Stat label="Likes" value={data.likeCount} />
            <Stat label="Purchases" value={data.purchaseCount} />
            {data.priceUsd && <Stat label="Price" value={money(data.priceUsd)} />}
          </StatGroup>

          {data.reports.length > 0 && (
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={statGroupHeadingStyle}>Reports</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {data.reports.map((r) => (
                  <div key={r.id} style={{ ...auditRowStyle, borderColor: "var(--danger)" }}>
                    <span style={{ fontWeight: 600, color: "var(--danger)" }}>{humanizeKey(r.reason)}</span>
                    <span style={mutedSmallStyle}>
                      {r.details ? `${r.details} · ` : ""}
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={statGroupHeadingStyle}>Moderation history</h3>
            {data.moderationHistory.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No moderation actions on this item yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {data.moderationHistory.map((a) => (
                  <div key={a.id} style={auditRowStyle}>
                    <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{a.action.replace(/[._]/g, " ")}</span>
                    <span style={mutedSmallStyle}>
                      {a.actorEmail} · {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const navGroupsWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  margin: "1.5rem 0 2rem",
  paddingBottom: "1rem",
  borderBottom: "1px solid var(--border)",
};

const navGroupRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.4rem",
};

const navGroupLabelStyle: React.CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  minWidth: "6.5rem",
};

const tabButtonDisabledStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px dashed var(--border)",
  color: "var(--text-muted)",
  borderRadius: "999px",
  padding: "0.4rem 0.95rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  opacity: 0.5,
  cursor: "default",
};

const navBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  marginLeft: "0.4rem",
  background: "var(--danger)",
  color: "#fff",
  borderRadius: "999px",
  padding: "0.05rem 0.4rem",
  fontSize: "0.72rem",
  fontWeight: 700,
};

const tabButtonStyle: React.CSSProperties = {
  background: "transparent",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  color: "var(--text-muted)",
  borderRadius: "999px",
  padding: "0.4rem 0.95rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const tabButtonActiveStyle: React.CSSProperties = {
  ...tabButtonStyle,
  background: "var(--accent)",
  borderColor: "var(--accent)",
  color: "var(--bg)",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1rem",
};

const statGroupHeadingStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: "0 0 0.75rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" };

const rowCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "0.9rem 1.1rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const approveButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const rejectButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const statusSelectStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.6rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  cursor: "pointer",
  textTransform: "capitalize",
};

const auditRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  padding: "0.6rem 0",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.85rem",
};

const heroStatGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "1rem",
  marginBottom: "2.5rem",
};

const heroStatCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "16px",
  padding: "1.25rem 1.4rem",
  boxShadow: "var(--glow)",
};

const heroStatValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.9rem",
  fontWeight: 600,
  lineHeight: 1.1,
  marginBottom: "0.3rem",
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "0.75rem",
};

const statCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "12px",
  padding: "0.8rem 1rem",
};

const statValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.3rem",
  fontWeight: 600,
  lineHeight: 1.1,
  marginBottom: "0.2rem",
};

const memberFilterBarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  marginBottom: "1.25rem",
};

const memberSearchInputStyle: React.CSSProperties = {
  flex: "1 1 220px",
  padding: "0.5rem 0.7rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: "0.85rem",
};

const commandCentreHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  marginBottom: "1.5rem",
};

const rangeSelectorStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const chartGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "1rem",
  marginBottom: "0.75rem",
};

const chartCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "0.9rem 1rem 0.5rem",
};

const foundingProgressWrapStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
};

const foundingProgressBarOuterStyle: React.CSSProperties = {
  height: "10px",
  borderRadius: "999px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  overflow: "hidden",
  marginBottom: "0.5rem",
};

const foundingProgressBarInnerStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--accent-dim), var(--accent))",
  transition: "width 0.3s ease",
};

const funnelWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  marginBottom: "1.5rem",
};

const funnelRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "9rem 1fr 2.5rem",
  alignItems: "center",
  gap: "0.6rem",
  cursor: "pointer",
  padding: "0.15rem 0",
};

const funnelLabelStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
};

const funnelBarOuterStyle: React.CSSProperties = {
  height: "10px",
  borderRadius: "999px",
  background: "var(--surface-raised)",
  overflow: "hidden",
};

const funnelBarInnerStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  minWidth: "2px",
  transition: "width 0.3s ease",
};

const funnelCountStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 700,
  textAlign: "right",
};

const actionItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "0.75rem 1rem",
  fontSize: "0.85rem",
};

const actionCountStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.6rem",
  height: "1.6rem",
  borderRadius: "999px",
  background: "var(--accent)",
  color: "var(--bg)",
  fontWeight: 700,
  fontSize: "0.8rem",
};

const filterChipStyle: React.CSSProperties = {
  background: "var(--accent-soft)",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  borderRadius: "999px",
  padding: "0.2rem 0.7rem",
  fontSize: "0.72rem",
  fontWeight: 600,
  cursor: "pointer",
  textTransform: "capitalize",
};

const filterCheckboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.82rem",
  color: "var(--text-muted)",
  cursor: "pointer",
};

const foundingBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  marginLeft: "0.5rem",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
  borderRadius: "999px",
  padding: "0.05rem 0.5rem",
  fontSize: "0.68rem",
  fontWeight: 700,
  verticalAlign: "middle",
};
