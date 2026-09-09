"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSession, displayHeadingStyle, SignInGate } from "@/components/ui";
import { FOUNDING_STATUSES } from "@/lib/founding/status";

interface CreatorApplication {
  creatorProfileId: string;
  status: string;
  appliedAt: string;
  applicantEmail: string;
  identityDetails: { dateOfBirth: string; nationality: string; maskedIdNumber: string } | null;
  identityDocumentUrl: string | null;
  identityAgeReviewUrl: string | null;
  livenessReviewUrl: string | null;
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

const TABS = ["Overview", "Members", "Creators", "Applications", "Founding Partners", "Content", "Revenue", "Payouts", "Trust & Safety", "Audit Log", "System Health", "Reset Roster"] as const;
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
    conversion: { appliedToVerified: number | null; verifiedToApproved: number | null; approvedToLive: number | null };
    newInRange: number;
    awaitingReview: number;
    onboarding: number;
    readyForLaunch: number;
  };
  actionRequired: { id: string; label: string; count: number; linkTab: Tab | null }[];
  badges: { applications: number; content: number; payouts: number; trustSafety: number };
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
  // Each group gets its own accent — a deliberate, functional use of
  // color (category identity, scannable at a glance in the sidebar), not
  // decoration: everywhere else in this app stays the single blue brand
  // accent (see components/ui.tsx's own comment on why), but the admin
  // shell is an internal tool where color-coding real information
  // (which part of the business a section belongs to) earns its keep.
  color: string;
  items: NavLeaf[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "Command Centre", color: "#3b82f6", items: [{ label: "Overview", tab: "Overview" }] },
  {
    label: "People",
    color: "#a855f7",
    items: [
      { label: "Members", tab: "Members" },
      { label: "Creators", tab: "Creators" },
      { label: "Applications", tab: "Applications", badgeKey: "applications" },
      { label: "Founding Partners", tab: "Founding Partners" },
    ],
  },
  { label: "Content", color: "#e0a626", items: [{ label: "Content", tab: "Content", badgeKey: "content" }] },
  {
    label: "Business",
    color: "#22c55e",
    items: [{ label: "Revenue", tab: "Revenue" }, { label: "Payouts", tab: "Payouts", badgeKey: "payouts" }],
  },
  {
    label: "Insights",
    color: "#22b8cf",
    items: [{ label: "Trust & Safety", tab: "Trust & Safety", badgeKey: "trustSafety" }, { label: "Audit Log", tab: "Audit Log" }],
  },
  {
    label: "System",
    color: "#94a3b8",
    items: [
      { label: "System Health", tab: "System Health" },
      { label: "Reset Roster", tab: "Reset Roster" },
    ],
  },
];

/** Vertical sidebar nav — grouped sections, each with its own color dot
 * on the group label and a matching left-border/background tint on its
 * active item, so "which part of the business am I in" reads at a glance
 * without having to read every label. */
function NavGroups({ tab, onSelect, badges }: { tab: Tab; onSelect: (t: Tab) => void; badges?: CommandCentreData["badges"] }) {
  return (
    <nav style={navGroupsWrapStyle}>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} style={navGroupSectionStyle}>
          <span style={navGroupLabelStyle}>
            <span style={{ ...navGroupDotStyle, background: group.color }} aria-hidden="true" />
            {group.label}
          </span>
          <div style={navGroupItemsStyle}>
            {group.items.map((item) => {
              if (!item.tab) {
                return (
                  <span key={item.label} style={sidebarTabDisabledStyle}>
                    {item.label} · soon
                  </span>
                );
              }
              const count = item.badgeKey && badges ? badges[item.badgeKey] : 0;
              const active = item.tab === tab;
              return (
                <button
                  key={item.label}
                  onClick={() => onSelect(item.tab!)}
                  style={sidebarTabStyle(active, group.color)}
                >
                  {item.label}
                  {count > 0 && <span style={navBadgeStyle}>{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
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

  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.tab === tab));

  return (
    <div className="admin-shell" style={adminShellStyle}>
      <aside className="admin-sidebar" style={adminSidebarStyle}>
        <div style={adminBrandRowStyle}>
          <span style={adminBrandMarkStyle} aria-hidden="true" />
          <span style={adminBrandTextStyle}>Command Centre</span>
        </div>
        <NavGroups tab={tab} onSelect={setTab} badges={ccData?.badges} />
      </aside>

      <main style={adminContentStyle}>
        <div style={{ ...adminContentHeaderStyle, borderColor: activeGroup?.color ?? "var(--border)" }}>
          <span style={{ ...adminContentEyebrowStyle, color: activeGroup?.color ?? "var(--accent)" }}>
            {activeGroup?.label ?? "Command Centre"}
          </span>
          <h1 style={{ ...displayHeadingStyle, margin: 0 }}>{tab}</h1>
        </div>

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
        {tab === "Founding Partners" && <FoundingPartnersPanel />}
        {tab === "Content" && (
          <>
            <ContentQueue />
            <ContentLibrary />
          </>
        )}
        {tab === "Revenue" && <RevenuePanel onNavigate={setTab} />}
        {tab === "Payouts" && (
          <>
            <PayoutQueue />
            <PayoutHistory />
          </>
        )}
        {tab === "Trust & Safety" && <TrustAndSafetyPanel />}
        {tab === "Audit Log" && <AuditLogPanel />}
        {tab === "System Health" && <SystemHealthPanel />}
        {tab === "Reset Roster" && <ResetRosterPanel />}
      </main>
    </div>
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

// Single source of truth for the pipeline's status list — see its own
// doc comment. Used both for the funnel bar chart below and the status
// dropdown further down (previously two separately hand-kept copies).
const FOUNDING_FUNNEL_STAGES = FOUNDING_STATUSES;

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
        <Stat label="Applied → Verified" value={data.conversion.appliedToVerified !== null ? `${data.conversion.appliedToVerified}%` : "—"} />
        <Stat label="Verified → Approved" value={data.conversion.verifiedToApproved !== null ? `${data.conversion.verifiedToApproved}%` : "—"} />
        <Stat label="Approved → Live" value={data.conversion.approvedToLive !== null ? `${data.conversion.approvedToLive}%` : "—"} />
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

      <div style={filterCardStyle}>
        <span style={filterCardLabelStyle}>Filter</span>
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
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : members.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No {lockedRole === "CREATOR" ? "creators" : "members"} match.</p>
      ) : (
        <>
          <p style={mutedSmallStyle}>
            Showing {members.length} {members.length === 1 ? (lockedRole === "CREATOR" ? "creator" : "member") : lockedRole === "CREATOR" ? "creators" : "members"}
            {cursor ? " (more available)" : ""}.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {members.map((m) => (
              <div key={m.userId} style={rowCardStyle}>
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setSelectedUserId(m.userId)} role="button">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
                    {m.displayName ?? m.email}
                    <span style={roleBadgeStyle(m.role)}>{humanizeKey(m.role)}</span>
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
  ageVerifiedAt: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastSession: { at: string; ipAddress: string | null } | null;
  foundingApplication: { id: string; status: string; appliedAt: string } | null;
  creatorProfile: {
    status: string;
    appliedAt: string;
    approvedAt: string | null;
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
    subscriptions: { creatorProfileId: string; creatorDisplayName: string; priceUsd: string; currentPeriodEnd: string }[];
    paymentHistory: { id: string; type: "purchase" | "tip"; amountUsd: string; refunded: boolean; createdAt: string }[];
    trial: {
      status: string;
      startedAt: string;
      expiresAt: string;
      convertedAt: string | null;
      cancelledAt: string | null;
    } | null;
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

const MEMBER_DETAIL_TABS = [
  "Overview",
  "Contact",
  "Verification",
  "Location",
  "Subscriptions",
  "Payment History",
  "Moderation",
  "Activity",
] as const;
type MemberDetailTab = (typeof MEMBER_DETAIL_TABS)[number];

function MemberDetailView({ userId, onBack, onChanged }: { userId: string; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<MemberDetailTab>("Overview");

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

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {MEMBER_DETAIL_TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={t === tab ? tabButtonActiveStyle : tabButtonStyle}>
                {t}
              </button>
            ))}
          </div>

          {tab === "Overview" && (
            <>
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
            </>
          )}

          {tab === "Contact" && (
            <StatGroup title="Contact">
              <Stat label="Email" value={data.emailVerified ? "Verified" : "Unverified"} />
              {data.emailVerifiedAt && <Stat label="Verified at" value={new Date(data.emailVerifiedAt).toLocaleString()} />}
            </StatGroup>
          )}

          {tab === "Verification" && (
            <StatGroup title="Verification">
              <Stat label="Age" value={data.ageVerified ? "Confirmed (self-declared)" : "Not confirmed"} />
              {data.ageVerifiedAt && <Stat label="Confirmed at" value={new Date(data.ageVerifiedAt).toLocaleString()} />}
              <p style={{ ...mutedSmallStyle, marginTop: "0.6rem", maxWidth: "480px" }}>
                Fans aren&apos;t required to submit identity documents in V1 — this is the 18+ checkbox
                confirmed at registration, not ID-based verification.
              </p>
            </StatGroup>
          )}

          {tab === "Location" && (
            <StatGroup title="Location">
              <Stat label="Country" value={data.country ?? "Not provided"} />
              <Stat label="City" value={data.city ?? "Not provided"} />
              <p style={{ ...mutedSmallStyle, marginTop: "0.6rem", maxWidth: "480px" }}>
                Self-reported at registration (optionally assisted by browser geolocation) — not
                server-verified the way a creator&apos;s location is.
              </p>
            </StatGroup>
          )}

          {tab === "Subscriptions" && (
            <StatGroup title="Subscriptions">
              {data.fanFinancials?.trial && (
                <div
                  style={{
                    ...auditRowStyle,
                    marginBottom: "0.8rem",
                    borderColor: data.fanFinancials.trial.status === "ACTIVE" ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>24-hour trial · {humanizeKey(data.fanFinancials.trial.status)}</span>
                  <span style={mutedSmallStyle}>
                    Started {new Date(data.fanFinancials.trial.startedAt).toLocaleString()}
                    {data.fanFinancials.trial.status === "ACTIVE" &&
                      ` · expires ${new Date(data.fanFinancials.trial.expiresAt).toLocaleString()}`}
                    {data.fanFinancials.trial.convertedAt &&
                      ` · converted ${new Date(data.fanFinancials.trial.convertedAt).toLocaleString()}`}
                  </span>
                </div>
              )}
              {!data.fanFinancials ? (
                <p style={{ color: "var(--text-muted)" }}>N/A — this is a creator account.</p>
              ) : data.fanFinancials.subscriptions.length === 0 && !data.fanFinancials.activeVipPass ? (
                <p style={{ color: "var(--text-muted)" }}>No active subscriptions.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {data.fanFinancials.activeVipPass && (
                    <div style={auditRowStyle}>
                      <span style={{ fontWeight: 600 }}>VIP pass (platform-wide)</span>
                      <span style={mutedSmallStyle}>
                        {money(data.fanFinancials.activeVipPass.priceUsd)}/mo · renews{" "}
                        {new Date(data.fanFinancials.activeVipPass.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {data.fanFinancials.subscriptions.map((s) => (
                    <div key={s.creatorProfileId} style={auditRowStyle}>
                      <span style={{ fontWeight: 600 }}>{s.creatorDisplayName}</span>
                      <span style={mutedSmallStyle}>
                        {money(s.priceUsd)}/mo · renews {new Date(s.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </StatGroup>
          )}

          {tab === "Payment History" && (
            <StatGroup title="Payment history">
              {!data.fanFinancials ? (
                <p style={{ color: "var(--text-muted)" }}>N/A — this is a creator account.</p>
              ) : data.fanFinancials.paymentHistory.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No payments yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {data.fanFinancials.paymentHistory.map((p) => (
                    <div key={`${p.type}-${p.id}`} style={auditRowStyle}>
                      <span style={{ fontWeight: 600 }}>
                        {p.type === "purchase" ? "Content purchase" : "Tip"} · {money(p.amountUsd)}
                        {p.refunded ? " (refunded)" : ""}
                      </span>
                      <span style={mutedSmallStyle}>{new Date(p.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </StatGroup>
          )}

          {tab === "Moderation" && (
            <>
              {data.moderation.reportsFiled.length === 0 && data.moderation.reportsAgainst.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No moderation history.</p>
              ) : (
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
              )}
            </>
          )}

          {tab === "Activity" && (
            <>
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
            </>
          )}
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
  // Only ever set on applications submitted before this field was
  // removed from the form (see /founding-baddies/page.tsx) — kept
  // optional so those older rows still render correctly.
  followers?: string;
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
  // MASTER REQUIREMENTS sub-statuses (§5, §7) — read-only in Phase 1, see
  // GET /api/admin/founding-applications. Mostly null/empty until Phase 2
  // builds real capture (identity/contact/banking) — Location is the
  // exception, always populated from the moment of application (both
  // accept and reject paths write one, see src/app/api/founding/apply).
  identity: { status: string } | null;
  contact: { emailVerified: boolean; whatsappVerified: boolean } | null;
  location: {
    status: string;
    detectedCountry: string | null;
    detectionSignal: string;
    detectionTimestamp: string;
    rejectionReason: string | null;
  } | null;
  banking: {
    status: string;
    bankName: string;
    accountHolderName: string;
    maskedAccountNumber: string;
    accountType: string;
    branchCode: string;
  } | null;
  // Phase 2: real uploads, signed per-request (see GET
  // /api/admin/founding-applications) — never a stored/public URL.
  identityDocuments: { id: string; type: string; status: string; uploadedAt: string; signedUrl: string }[];
  // Phase 3: acceptance records only (who accepted which version, when)
  // — not gated on banking:view, see that route's own comment.
  agreements: { type: string; version: string; acceptedAt: string }[];
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Phase 4: the full identity/contact/location/banking/agreements/
  // activity picture (grown too large for an inline row expand across
  // Phases 1–3) moved to its own detail view — see
  // FoundingApplicationDetailView below, same selectedId-swap pattern
  // MembersPanel already uses for MemberDetailView.
  if (selectedId) {
    return (
      <FoundingApplicationDetailView
        id={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={reload}
        changeStatus={changeStatus}
        busy={busyId === selectedId}
      />
    );
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
          {visibleApplications.map((app) => (
            <div
              key={app.id}
              style={{ ...rowCardStyle, cursor: "pointer" }}
              onClick={() => setSelectedId(app.id)}
            >
              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {app.stageName} · {app.fullName}
                </div>
                <div style={mutedSmallStyle}>
                  {app.email} · {app.city}, {app.country} · applied {new Date(app.createdAt).toLocaleDateString()}
                </div>
                <div style={mutedSmallStyle}>
                  {app.platforms.length} platform{app.platforms.length === 1 ? "" : "s"} · Identity:{" "}
                  {app.identity ? humanizeKey(app.identity.status) : "Not submitted"} · Banking:{" "}
                  {app.banking ? humanizeKey(app.banking.status) : "Not submitted"} · Agreements:{" "}
                  {app.agreements.length}/4
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
                <span style={{ ...filterChipStyle, textDecoration: "none" }}>View full profile →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface FoundingApplicationDetail {
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
  status: string;
  adminNotes: string | null;
  createdAt: string;
  identity: {
    legalName: string;
    dateOfBirth: string;
    nationality: string;
    maskedIdNumber: string;
    status: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    failureReason: string | null;
  } | null;
  contact: {
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    whatsappVerified: boolean;
    whatsappVerifiedAt: string | null;
  } | null;
  location: {
    status: string;
    detectedCountry: string | null;
    detectionSignal: string;
    detectionTimestamp: string;
    rejectionReason: string | null;
  } | null;
  banking: {
    status: string;
    bankName: string;
    accountHolderName: string;
    maskedAccountNumber: string;
    accountType: string;
    branchCode: string;
    externalVerificationRef: string | null;
    verifiedAt: string | null;
  } | null;
  identityDocuments: { id: string; type: string; status: string; uploadedAt: string; signedUrl: string }[];
  agreements: { type: string; version: string; title: string; bodyText: string; acceptedAt: string }[];
  linkedAccount: {
    userId: string;
    contentCount: number;
    activeSubscribers: number;
    revenueUsd: string;
    creatorProfileId: string;
  } | null;
  activity: { id: string; action: string; actorEmail: string; createdAt: string }[];
  referralAttribution: {
    foundingPartnerId: string;
    partnerEmail: string;
    attributedAt: string;
    correctedBy: string | null;
    correctedAt: string | null;
    correctionReason: string | null;
  } | null;
}

const CREATOR_DETAIL_TABS = [
  "Overview",
  "Identity",
  "Verification",
  "Contact",
  "Location",
  "Creator Profile",
  "Content",
  "Subscribers",
  "Revenue",
  "Banking",
  "Agreements",
  "Activity",
] as const;
type CreatorDetailTab = (typeof CREATOR_DETAIL_TABS)[number];

/**
 * MASTER REQUIREMENTS §15 "Admin Creator Detail" — a FoundingApplication
 * detail view, not CreatorProfile, because every identity/contact/
 * location/banking/agreement field only ever gets written to a
 * FoundingApplication (see the plan file's own reasoning: no FK exists
 * either direction between it and User/CreatorProfile, and nothing
 * populates those five entities for a real account today). Content/
 * Subscribers/Revenue are the one exception — sourced from a real
 * linked account when one exists (matched by email at fetch time, see
 * the GET route), with an honest empty state otherwise.
 *
 * First tab-strip UI in this file — both prior detail views
 * (MemberDetailView, ModerationCaseDetailView) are single-scroll. Kept
 * deliberately as plain local state + buttons, not a reusable
 * component, since this is the only place that needs it.
 */
function FoundingApplicationDetailView({
  id,
  onBack,
  onChanged,
  changeStatus,
  busy,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  changeStatus: (id: string, status: string) => Promise<void>;
  busy: boolean;
}) {
  const [data, setData] = useState<FoundingApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CreatorDetailTab>("Overview");
  const [busyAction, setBusyAction] = useState(false);
  const [partners, setPartners] = useState<{ id: string; email: string }[]>([]);
  const [attributionChoice, setAttributionChoice] = useState("");

  function reload() {
    setLoading(true);
    fetch(`/api/admin/founding-applications/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: FoundingApplicationDetail | null) => {
        setData(body);
        setAttributionChoice(body?.referralAttribution?.foundingPartnerId ?? "");
      })
      .finally(() => setLoading(false));
  }

  useEffect(reload, [id]);
  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => (r.ok ? r.json() : { partners: [] }))
      .then((body) => setPartners((body.partners ?? []).map((p: { id: string; email: string }) => ({ id: p.id, email: p.email }))));
  }, []);

  async function correctAttribution() {
    const reason = window.prompt("Reason for this attribution change (required):");
    if (!reason) return;
    setBusyAction(true);
    const res = await fetch(`/api/admin/founding-applications/${id}/correct-attribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foundingPartnerId: attributionChoice || null, reason }),
    });
    setBusyAction(false);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't update attribution.");
    }
  }

  async function confirmWhatsapp() {
    setBusyAction(true);
    const res = await fetch(`/api/admin/founding-applications/${id}/confirm-whatsapp`, { method: "POST" });
    setBusyAction(false);
    if (res.ok) {
      reload();
      onChanged();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't confirm WhatsApp.");
    }
  }

  async function reviewIdentity(status: "VERIFIED" | "FAILED") {
    const failureReason =
      status === "FAILED" ? window.prompt("Reason (shown to no one but admins, optional):") ?? undefined : undefined;
    setBusyAction(true);
    const res = await fetch(`/api/admin/founding-applications/${id}/identity-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, failureReason }),
    });
    setBusyAction(false);
    if (res.ok) {
      reload();
      onChanged();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't submit identity review.");
    }
  }

  async function reviewBanking(status: "EXTERNALLY_VERIFIED" | "FAILED" | "NEEDS_CORRECTION") {
    const adminNotes =
      status !== "EXTERNALLY_VERIFIED"
        ? window.prompt("Notes (shown to no one but admins, optional):") ?? undefined
        : undefined;
    setBusyAction(true);
    const res = await fetch(`/api/admin/founding-applications/${id}/banking-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNotes }),
    });
    setBusyAction(false);
    if (res.ok) {
      reload();
      onChanged();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't submit banking review.");
    }
  }

  async function handleStatusChange(newStatus: string) {
    await changeStatus(id, newStatus);
    reload();
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <button onClick={onBack} style={{ ...tabButtonStyle, marginBottom: "1.25rem" }}>
        ← Back to list
      </button>

      {loading || !data ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <h2 style={{ ...sectionHeadingStyle, margin: 0 }}>
                {data.stageName} · {data.fullName}
              </h2>
              <div style={mutedSmallStyle}>
                {data.email} · {data.city}, {data.country} · applied {new Date(data.createdAt).toLocaleDateString()}
              </div>
            </div>
            <select
              value={data.status}
              disabled={busy}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={statusSelectStyle}
            >
              {FOUNDING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {CREATOR_DETAIL_TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={t === tab ? tabButtonActiveStyle : tabButtonStyle}>
                {t}
              </button>
            ))}
          </div>

          {tab === "Overview" && (
            <StatGroup title="Overview">
              <Stat label="Pipeline stage" value={humanizeKey(data.status)} />
              <Stat label="Identity" value={data.identity ? humanizeKey(data.identity.status) : "Not submitted"} alert={data.identity?.status === "SUBMITTED"} />
              <Stat label="Email" value={data.contact?.emailVerified ? "Verified" : "Unverified"} />
              <Stat label="WhatsApp" value={data.contact?.whatsappVerified ? "Verified" : "Unverified"} alert={data.contact !== null && !data.contact.whatsappVerified && data.contact.emailVerified} />
              <Stat label="Banking" value={data.banking ? humanizeKey(data.banking.status) : "Not submitted"} alert={data.banking?.status === "SUBMITTED"} />
              <Stat label="Agreements" value={`${data.agreements.length}/4 accepted`} />
              <Stat label="Registered account" value={data.linkedAccount ? "Yes" : "Not yet"} />
              <Stat
                label="Referred by"
                value={data.referralAttribution ? data.referralAttribution.partnerEmail : "No referral"}
              />
              {data.referralAttribution?.correctedBy && (
                <Stat label="Attribution corrected" value={data.referralAttribution.correctionReason ?? "—"} />
              )}
              <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={attributionChoice}
                  onChange={(e) => setAttributionChoice(e.target.value)}
                  style={statusSelectStyle}
                >
                  <option value="">No referral</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email}
                    </option>
                  ))}
                </select>
                <button onClick={correctAttribution} disabled={busyAction} style={approveButtonStyle}>
                  Save attribution correction
                </button>
              </div>
            </StatGroup>
          )}

          {tab === "Identity" && (
            <StatGroup title="Identity">
              {!data.identity ? (
                <p style={{ color: "var(--text-muted)" }}>Not submitted yet.</p>
              ) : (
                <>
                  <Stat label="Legal name" value={data.identity.legalName} />
                  <Stat label="Date of birth" value={new Date(data.identity.dateOfBirth).toLocaleDateString()} />
                  <Stat label="Nationality" value={data.identity.nationality} />
                  <Stat label="ID / passport number" value={data.identity.maskedIdNumber} />
                  <Stat label="Status" value={humanizeKey(data.identity.status)} />
                  {data.identity.failureReason && <Stat label="Failure reason" value={data.identity.failureReason} />}
                </>
              )}
              {data.identityDocuments.length > 0 && (
                <div style={{ marginTop: "0.8rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {data.identityDocuments.map((d) => (
                    <a key={d.id} href={d.signedUrl} target="_blank" rel="noreferrer" style={{ ...filterChipStyle, textDecoration: "none" }}>
                      View {humanizeKey(d.type)} ↗
                    </a>
                  ))}
                </div>
              )}
              {data.identity?.status === "SUBMITTED" && (
                <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => reviewIdentity("VERIFIED")} disabled={busyAction} style={approveButtonStyle}>
                    Verify identity
                  </button>
                  <button onClick={() => reviewIdentity("FAILED")} disabled={busyAction} style={rejectButtonStyle}>
                    Fail identity
                  </button>
                </div>
              )}
            </StatGroup>
          )}

          {tab === "Verification" && (
            <StatGroup title="Verification checklist">
              <Stat label="Location" value={data.location?.status === "SOUTH_AFRICA" ? "✓ South Africa" : "○ " + (data.location ? humanizeKey(data.location.status) : "Pending")} />
              <Stat label="Identity" value={data.identity?.status === "VERIFIED" ? "✓ Verified" : "○ " + (data.identity ? humanizeKey(data.identity.status) : "Not submitted")} />
              <Stat label="Email" value={data.contact?.emailVerified ? "✓ Verified" : "○ Unverified"} />
              <Stat label="WhatsApp" value={data.contact?.whatsappVerified ? "✓ Verified" : "○ Unverified"} />
              <Stat label="Banking" value={data.banking?.status === "EXTERNALLY_VERIFIED" ? "✓ Verified" : "○ " + (data.banking ? humanizeKey(data.banking.status) : "Not submitted")} />
            </StatGroup>
          )}

          {tab === "Contact" && (
            <StatGroup title="Contact">
              <Stat label="Email" value={data.contact?.emailVerified ? "Verified" : "Unverified"} />
              {data.contact?.emailVerifiedAt && <Stat label="Email verified at" value={new Date(data.contact.emailVerifiedAt).toLocaleString()} />}
              <Stat label="WhatsApp" value={data.contact?.whatsappVerified ? "Verified" : "Unverified"} />
              {data.contact?.whatsappVerifiedAt && <Stat label="WhatsApp verified at" value={new Date(data.contact.whatsappVerifiedAt).toLocaleString()} />}
              {data.contact && !data.contact.whatsappVerified && (
                <div style={{ marginTop: "0.6rem" }}>
                  <button onClick={confirmWhatsapp} disabled={busyAction} style={approveButtonStyle}>
                    Confirm WhatsApp
                  </button>
                </div>
              )}
            </StatGroup>
          )}

          {tab === "Location" && (
            <StatGroup title="Location">
              {!data.location ? (
                <p style={{ color: "var(--text-muted)" }}>Pending.</p>
              ) : (
                <>
                  <Stat label="Status" value={humanizeKey(data.location.status)} />
                  <Stat label="Detected country" value={data.location.detectedCountry ?? "Unknown"} />
                  <Stat label="Detection signal" value={humanizeKey(data.location.detectionSignal)} />
                  <Stat label="Detected at" value={new Date(data.location.detectionTimestamp).toLocaleString()} />
                  {data.location.rejectionReason && <Stat label="Rejection reason" value={data.location.rejectionReason} />}
                </>
              )}
            </StatGroup>
          )}

          {tab === "Creator Profile" && (
            <StatGroup title="Creator profile">
              <Stat label="Stage name" value={data.stageName} />
              {data.audienceSize && <Stat label="Audience size" value={data.audienceSize} />}
              {data.creatingSince && <Stat label="Creating since" value={data.creatingSince} />}
              {data.currentlyMonetising !== null && <Stat label="Currently monetising" value={data.currentlyMonetising ? "Yes" : "Not yet"} />}
              {data.monetisationExperience && <Stat label="Monetisation experience" value={data.monetisationExperience} />}
              <div style={{ marginTop: "0.6rem" }}>
                {data.platforms.map((p, i) => (
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
              </div>
            </StatGroup>
          )}

          {tab === "Content" && (
            <StatGroup title="Content">
              {data.linkedAccount ? (
                <Stat label="Content items" value={data.linkedAccount.contentCount} />
              ) : (
                <p style={{ color: "var(--text-muted)" }}>Not yet a registered creator — no account exists to have content.</p>
              )}
            </StatGroup>
          )}

          {tab === "Subscribers" && (
            <StatGroup title="Subscribers">
              {data.linkedAccount ? (
                <Stat label="Active subscribers" value={data.linkedAccount.activeSubscribers} />
              ) : (
                <p style={{ color: "var(--text-muted)" }}>Not yet a registered creator — no account exists to have subscribers.</p>
              )}
            </StatGroup>
          )}

          {tab === "Revenue" && (
            <StatGroup title="Revenue">
              {data.linkedAccount ? (
                <Stat label="Creator share, all-time" value={`$${data.linkedAccount.revenueUsd}`} />
              ) : (
                <p style={{ color: "var(--text-muted)" }}>Not yet a registered creator — no account exists to have revenue.</p>
              )}
            </StatGroup>
          )}

          {tab === "Banking" && (
            <StatGroup title="Banking">
              {!data.banking ? (
                <p style={{ color: "var(--text-muted)" }}>Not submitted yet.</p>
              ) : (
                <>
                  <Stat label="Bank" value={data.banking.bankName} />
                  <Stat label="Account holder" value={data.banking.accountHolderName} />
                  <Stat label="Account number" value={data.banking.maskedAccountNumber} />
                  <Stat label="Account type" value={humanizeKey(data.banking.accountType)} />
                  <Stat label="Branch code" value={data.banking.branchCode} />
                  <Stat label="Status" value={humanizeKey(data.banking.status)} />
                  {data.banking.externalVerificationRef && <Stat label="External reference" value={data.banking.externalVerificationRef} />}
                  {data.banking.verifiedAt && <Stat label="Verified at" value={new Date(data.banking.verifiedAt).toLocaleString()} />}
                </>
              )}
              {data.banking?.status === "SUBMITTED" && (
                <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => reviewBanking("EXTERNALLY_VERIFIED")} disabled={busyAction} style={approveButtonStyle}>
                    Mark verified
                  </button>
                  <button onClick={() => reviewBanking("NEEDS_CORRECTION")} disabled={busyAction} style={rejectButtonStyle}>
                    Needs correction
                  </button>
                  <button onClick={() => reviewBanking("FAILED")} disabled={busyAction} style={rejectButtonStyle}>
                    Fail
                  </button>
                </div>
              )}
            </StatGroup>
          )}

          {tab === "Agreements" && (
            <StatGroup title="Agreements">
              {data.agreements.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>None accepted yet.</p>
              ) : (
                data.agreements.map((a) => (
                  <div key={a.type} style={{ marginBottom: "1rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                      {a.title} ({a.version})
                    </div>
                    <div style={mutedSmallStyle}>Accepted {new Date(a.acceptedAt).toLocaleString()}</div>
                    <details style={{ marginTop: "0.4rem" }}>
                      <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--accent)" }}>View full text</summary>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", whiteSpace: "pre-wrap", marginTop: "0.4rem" }}>
                        {a.bodyText}
                      </p>
                    </details>
                  </div>
                ))
              )}
            </StatGroup>
          )}

          {tab === "Activity" && (
            <StatGroup title="Activity / audit history">
              {data.activity.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No recorded activity yet.</p>
              ) : (
                data.activity.map((a) => (
                  <div key={a.id} style={auditRowStyle}>
                    <span>{humanizeKey(a.action)}</span>
                    <span style={mutedSmallStyle}>
                      {a.actorEmail} · {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </StatGroup>
          )}
        </>
      )}
    </section>
  );
}

interface RevenueData {
  range: string;
  summary: {
    grossAllTimeUsd: string;
    grossInRangeUsd: string;
    grossDeltaPct: number | null;
    creatorShareAllTimeUsd: string;
    platformShareAllTimeUsd: string;
    mrrUsd: string;
    refundsAllTimeUsd: string;
  };
  subscriptions: {
    activeCreatorSubs: number;
    activeVipPass: number;
    newInRange: number;
    cancelledInRange: number;
    churnRatePct: number | null;
    failedPayments: number;
  };
  payouts: { pendingCount: number; pendingAmountUsd: string; paidCount: number; paidAmountUsd: string };
  revenueByCreator: { creatorProfileId: string; email: string; displayName: string | null; revenueUsd: string }[];
  chart: { date: string; gross: number }[];
}

/**
 * Spec §11 — subscriptions/revenue overview. Production is genuinely
 * all zeros right now (no subscriptions/payments have happened yet),
 * so this reads mostly as $0.00/— today; every figure is still a real
 * query (GET /api/admin/revenue), not a placeholder. Reuses KpiCard/
 * StatGroup/Stat/GrowthChart/RANGE_OPTIONS from Overview rather than
 * building parallel versions.
 */
function RevenuePanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/revenue?range=${range}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load revenue.");
        }
        return r.json();
      })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setError(null);
        }
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
  }, [range]);

  return (
    <section>
      <div style={commandCentreHeaderStyle}>
        <h2 style={{ ...sectionHeadingStyle, margin: 0 }}>Revenue</h2>
        <div style={rangeSelectorStyle}>
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => setRange(opt.key)} style={opt.key === range ? tabButtonActiveStyle : tabButtonStyle}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data && (
        <>
          <div style={heroStatGridStyle}>
            <KpiCard label="Revenue (period)" value={money(data.summary.grossInRangeUsd)} deltaPct={data.summary.grossDeltaPct} caption={`${money(data.summary.grossAllTimeUsd)} all-time`} />
            <KpiCard label="MRR" value={money(data.summary.mrrUsd)} />
            <KpiCard label="Active subscriptions" value={(data.subscriptions.activeCreatorSubs + data.subscriptions.activeVipPass).toLocaleString()} />
            <KpiCard
              label="Failed payments"
              value={data.subscriptions.failedPayments.toLocaleString()}
              alert={data.subscriptions.failedPayments > 0}
            />
          </div>

          <StatGroup title="Subscriptions">
            <Stat label="Active creator subscriptions" value={data.subscriptions.activeCreatorSubs} />
            <Stat label="Active VIP pass" value={data.subscriptions.activeVipPass} />
            <Stat label="New (period)" value={data.subscriptions.newInRange} />
            <Stat label="Cancelled (period)" value={data.subscriptions.cancelledInRange} />
            <Stat label="Churn (period)" value={data.subscriptions.churnRatePct !== null ? `${data.subscriptions.churnRatePct}%` : "—"} />
          </StatGroup>

          <StatGroup title="Revenue split (all-time)">
            <Stat label="Gross" value={money(data.summary.grossAllTimeUsd)} />
            <Stat label="Creator share" value={money(data.summary.creatorShareAllTimeUsd)} />
            <Stat label="Platform share" value={money(data.summary.platformShareAllTimeUsd)} />
            <Stat label="Refunds" value={money(data.summary.refundsAllTimeUsd)} />
          </StatGroup>

          <div style={{ marginBottom: "2rem" }}>
            <h3 style={statGroupHeadingStyle}>Payouts</h3>
            <div style={statGridStyle}>
              <Stat label="Pending" value={data.payouts.pendingCount} alert={data.payouts.pendingCount > 0} />
              <Stat label="Pending amount" value={money(data.payouts.pendingAmountUsd)} />
              <Stat label="Paid (all-time)" value={data.payouts.paidCount} />
              <Stat label="Paid amount (all-time)" value={money(data.payouts.paidAmountUsd)} />
            </div>
            <button onClick={() => onNavigate("Payouts")} style={{ ...approveButtonStyle, marginTop: "0.75rem" }}>
              Go to Payouts →
            </button>
          </div>

          <div style={{ marginBottom: "2rem" }}>
            <h3 style={statGroupHeadingStyle}>Revenue over time</h3>
            <GrowthChart title="Gross revenue" data={data.chart.map((c) => ({ date: c.date, count: c.gross }))} />
          </div>

          <div>
            <h3 style={statGroupHeadingStyle}>Revenue by creator</h3>
            {data.revenueByCreator.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No revenue yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {data.revenueByCreator.map((c) => (
                  <div key={c.creatorProfileId} style={rowCardStyle}>
                    <span>{c.displayName ?? c.email}</span>
                    <span style={{ fontWeight: 700 }}>{money(c.revenueUsd)}</span>
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

interface PayoutHistoryItem {
  payoutId: string;
  creatorEmail: string;
  amountUsd: string;
  status: string;
  requestedAt: string;
  processedAt: string | null;
  failureReason: string | null;
}

interface PayoutStatusCounts {
  REQUESTED: number;
  APPROVED: number;
  PROCESSING: number;
  PAID: number;
  FAILED: number;
  REVERSED: number;
  totalPaidUsd: string;
}

const PAYOUT_STATUSES = ["REQUESTED", "APPROVED", "PROCESSING", "PAID", "FAILED", "REVERSED"] as const;

/**
 * Every payout regardless of status, alongside PayoutQueue's focused
 * "needs approval now" list (unchanged, above this) — same queue +
 * history split as Content (Phase 3) and Members/Creators (Phase 2).
 */
function PayoutHistory() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<PayoutHistoryItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<PayoutStatusCounts | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildParams(cursorValue?: string) {
    const params = new URLSearchParams();
    params.set("status", status || "all");
    if (query.trim()) params.set("query", query.trim());
    if (cursorValue) params.set("cursor", cursorValue);
    return params.toString();
  }

  function reload() {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/payouts?${buildParams()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load payouts.");
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
    const res = await fetch(`/api/admin/payouts?${buildParams(cursor)}`);
    setLoadingMore(false);
    if (!res.ok) return;
    const body = await res.json();
    setItems((prev) => [...prev, ...(body.items ?? [])]);
    setCursor(body.nextCursor ?? null);
  }

  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStatus(id: string, newStatus: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/payouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Update failed.");
    }
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Payout history</h2>
      {statusCounts && (
        <div style={{ ...statGridStyle, marginBottom: "1.25rem" }}>
          <Stat label="Requested" value={statusCounts.REQUESTED} alert={statusCounts.REQUESTED > 0} />
          <Stat label="Approved" value={statusCounts.APPROVED} />
          <Stat label="Processing" value={statusCounts.PROCESSING} />
          <Stat label="Paid" value={statusCounts.PAID} />
          <Stat label="Failed" value={statusCounts.FAILED} alert={statusCounts.FAILED > 0} />
          <Stat label="Reversed" value={statusCounts.REVERSED} />
          <Stat label="Total paid" value={money(statusCounts.totalPaidUsd)} />
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
          placeholder="Search creator email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select style={statusSelectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {PAYOUT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanizeKey(s)}
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
        <p style={{ color: "var(--text-muted)" }}>No payouts match.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {items.map((p) => (
              <div key={p.payoutId} style={rowCardStyle}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    {p.creatorEmail} · {money(p.amountUsd)}
                  </div>
                  <div style={mutedSmallStyle}>
                    requested {new Date(p.requestedAt).toLocaleDateString()}
                    {p.processedAt ? ` · processed ${new Date(p.processedAt).toLocaleDateString()}` : ""}
                    {p.failureReason ? ` · ${p.failureReason}` : ""}
                  </div>
                </div>
                <select
                  value={p.status}
                  disabled={busyId === p.payoutId}
                  onChange={(e) => changeStatus(p.payoutId, e.target.value)}
                  style={statusSelectStyle}
                >
                  {PAYOUT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanizeKey(s)}
                    </option>
                  ))}
                </select>
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

interface ModerationCaseRow {
  caseId: string;
  status: string;
  escalated: boolean;
  resolutionNotes: string | null;
  assignedToAdminEmail: string | null;
  createdAt: string;
  resolvedAt: string | null;
  report: { reportId: string; reason: string; details: string | null; reporterEmail: string } | null;
  target:
    | { type: "content"; contentId: string; caption: string | null; creatorEmail: string }
    | { type: "user"; userId: string; email: string }
    | { type: "unknown" };
}

interface ModerationSummary {
  openCases: number;
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  suspendedAccounts: number;
  bannedAccounts: number;
  flaggedContent: number;
}

const CASE_STATUSES = ["OPEN", "IN_REVIEW", "ESCALATED", "UPHELD", "APPEALED", "RESOLVED", "DISMISSED"] as const;

/**
 * Trust & Safety (spec §13) — every Report opens exactly one
 * ModerationCase (see src/app/api/reports/route.ts's own transaction),
 * so this is one queue rather than reconciling reports and cases
 * separately. Suspended/banned account counts blend two real sources
 * (CreatorProfile.status for creators, latest audit-log action for
 * everyone else) — see this session's plan file for why.
 */
function TrustAndSafetyPanel() {
  const [status, setStatus] = useState("");
  const [cases, setCases] = useState<ModerationCaseRow[]>([]);
  const [summary, setSummary] = useState<ModerationSummary | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<ModerationCaseRow | null>(null);

  function buildParams(cursorValue?: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (cursorValue) params.set("cursor", cursorValue);
    return params.toString();
  }

  function reload() {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/moderation?${buildParams()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load moderation cases.");
        }
        return r.json();
      })
      .then((body) => {
        setCases(body.cases ?? []);
        setCursor(body.nextCursor ?? null);
        setSummary(body.summary ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetch(`/api/admin/moderation?${buildParams(cursor)}`);
    setLoadingMore(false);
    if (!res.ok) return;
    const body = await res.json();
    setCases((prev) => [...prev, ...(body.cases ?? [])]);
    setCursor(body.nextCursor ?? null);
  }

  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedCase) {
    return (
      <ModerationCaseDetailView
        caseRow={selectedCase}
        onBack={() => {
          setSelectedCase(null);
          reload();
        }}
      />
    );
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Trust &amp; Safety</h2>
      {summary && (
        <div style={{ ...statGridStyle, marginBottom: "1.25rem" }}>
          <Stat label="Open cases" value={summary.openCases} alert={summary.openCases > 0} />
          <Stat label="Total reports" value={summary.totalReports} />
          <Stat label="Pending reports" value={summary.pendingReports} alert={summary.pendingReports > 0} />
          <Stat label="Resolved reports" value={summary.resolvedReports} />
          <Stat label="Suspended accounts" value={summary.suspendedAccounts} />
          <Stat label="Banned accounts" value={summary.bannedAccounts} />
          <Stat label="Flagged content" value={summary.flaggedContent} />
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reload();
        }}
        style={memberFilterBarStyle}
      >
        <select style={statusSelectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanizeKey(s)}
            </option>
          ))}
        </select>
        <button type="submit" style={approveButtonStyle}>
          Filter
        </button>
      </form>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : cases.length === 0 ? (
        <p style={{ color: "var(--success)", fontWeight: 600 }}>No cases match — you&apos;re all caught up.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {cases.map((c) => (
              <div key={c.caseId} style={rowCardStyle}>
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setSelectedCase(c)} role="button">
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    {c.report ? humanizeKey(c.report.reason) : "Unknown reason"} ·{" "}
                    {c.target.type === "content" ? c.target.creatorEmail : c.target.type === "user" ? c.target.email : "unknown target"}
                  </div>
                  <div style={mutedSmallStyle}>
                    reported by {c.report?.reporterEmail ?? "unknown"} · {new Date(c.createdAt).toLocaleDateString()}
                    {c.assignedToAdminEmail ? ` · assigned: ${c.assignedToAdminEmail}` : ""}
                  </div>
                </div>
                <span style={filterChipStyle}>{humanizeKey(c.status)}</span>
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

function ModerationCaseDetailView({ caseRow, onBack }: { caseRow: ModerationCaseRow; onBack: () => void }) {
  const [status, setStatus] = useState(caseRow.status);
  const [notes, setNotes] = useState(caseRow.resolutionNotes ?? "");
  const [assignedToAdminEmail, setAssignedToAdminEmail] = useState(caseRow.assignedToAdminEmail);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(extra?: { assignToSelf?: boolean }) {
    setBusy(true);
    setSaved(false);
    const res = await fetch(`/api/admin/moderation/${caseRow.caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolutionNotes: notes || null, ...(extra ?? {}) }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      if (extra?.assignToSelf) setAssignedToAdminEmail("you");
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Save failed.");
    }
  }

  return (
    <section>
      <button onClick={onBack} style={{ ...tabButtonStyle, marginBottom: "1.25rem" }}>
        ← Back to list
      </button>

      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ ...sectionHeadingStyle, margin: "0 0 0.3rem" }}>{caseRow.report ? humanizeKey(caseRow.report.reason) : "Unknown reason"}</h2>
        <div style={mutedSmallStyle}>
          Reported by {caseRow.report?.reporterEmail ?? "unknown"} · {new Date(caseRow.createdAt).toLocaleString()}
        </div>
        {caseRow.report?.details && <p style={{ fontSize: "0.85rem", marginTop: "0.5rem", maxWidth: "480px" }}>{caseRow.report.details}</p>}
      </div>

      <StatGroup title="Target">
        {caseRow.target.type === "content" && (
          <>
            <Stat label="Creator" value={caseRow.target.creatorEmail} />
            <Stat label="Caption" value={caseRow.target.caption || "(no caption)"} />
          </>
        )}
        {caseRow.target.type === "user" && <Stat label="Reported user" value={caseRow.target.email} />}
        {caseRow.target.type === "unknown" && <Stat label="Target" value="Unknown" />}
      </StatGroup>

      <div style={{ marginBottom: "1.5rem" }}>
        <h3 style={statGroupHeadingStyle}>Resolve</h3>
        <select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} style={statusSelectStyle}>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanizeKey(s)}
            </option>
          ))}
        </select>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Resolution notes..."
          style={resolutionTextareaStyle}
        />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button onClick={() => save()} disabled={busy} style={approveButtonStyle}>
            Save
          </button>
          <button onClick={() => save({ assignToSelf: true })} disabled={busy} style={rejectButtonStyle}>
            Assign to me
          </button>
          {saved && <span style={{ color: "var(--success)", fontSize: "0.82rem" }}>Saved.</span>}
        </div>
        {assignedToAdminEmail && <p style={mutedSmallStyle}>Assigned: {assignedToAdminEmail}</p>}
      </div>
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

interface SystemHealthData {
  database: { connected: boolean; latencyMs: number | null; error: string | null };
  runtime: { nodeVersion: string; appVersion: string; uptimeSeconds: number; nodeEnv: string };
  launchMode: string;
  providers: {
    payment: { name: string; isStub: boolean };
    storage: { name: string; isStub: boolean };
    verification: { name: string; isStub: boolean };
  };
  notImplemented: { label: string; reason: string }[];
}

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Spec §15 — a real, honest snapshot (see GET /api/admin/system-health's
 * own doc comment): database connectivity + latency, runtime facts, and
 * which providers are still `stub` (true in production too, pre-launch —
 * that's real, useful information, not a placeholder). The three things
 * the spec asks for that genuinely don't exist yet in this codebase
 * (failed jobs, a system error log, notification failures) are listed
 * plainly as not implemented rather than a fabricated all-clear.
 */
function SystemHealthPanel() {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/system-health")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load system health.");
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
  }, []);

  return (
    <section>
      <h2 style={sectionHeadingStyle}>System Health</h2>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data && (
        <>
          <div style={heroStatGridStyle}>
            <KpiCard
              label="Database"
              value={data.database.connected ? "Connected" : "Disconnected"}
              caption={data.database.connected ? `${data.database.latencyMs}ms latency` : data.database.error ?? undefined}
              alert={!data.database.connected}
            />
            <KpiCard label="Launch mode" value={data.launchMode === "coming_soon" ? "Coming soon" : "Live"} />
            <KpiCard label="Uptime" value={formatUptime(data.runtime.uptimeSeconds)} caption={data.runtime.nodeEnv} />
            <KpiCard label="App version" value={data.runtime.appVersion} caption={data.runtime.nodeVersion} />
          </div>

          <StatGroup title="Configured providers">
            <Stat label="Payment" value={data.providers.payment.name} alert={data.providers.payment.isStub} />
            <Stat label="Storage" value={data.providers.storage.name} alert={data.providers.storage.isStub} />
            <Stat label="Verification" value={data.providers.verification.name} alert={data.providers.verification.isStub} />
          </StatGroup>
          {(data.providers.payment.isStub || data.providers.storage.isStub || data.providers.verification.isStub) && (
            <p style={mutedSmallStyle}>
              A &quot;stub&quot; provider simulates the real thing for development — no real charges, files, or
              verifications happen through it. Swap it for a real provider before launch.
            </p>
          )}

          <div style={{ marginTop: "2rem" }}>
            <h3 style={statGroupHeadingStyle}>Not yet implemented</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data.notImplemented.map((item) => (
                <div key={item.label} style={auditRowStyle}>
                  <span style={{ fontWeight: 600 }}>{item.label}</span>
                  <span style={mutedSmallStyle}>{item.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

interface ResetRosterResult {
  deleted: {
    usersRemoved: number;
    partnersRemoved: number;
    creatorsRemoved: number;
    applicationsRemoved: number;
  };
  reseeded: boolean;
  reseedError: string | null;
  seededCreatorCount: number;
}

const RESET_CONFIRM_PHRASE = "RESET FOUNDING ROSTER";

/**
 * The one genuinely irreversible admin action in this app — see
 * POST /api/admin/system/reset-founding-roster's own doc comment for the
 * full deletion order and safety model (everything in one transaction;
 * rolls back whole, never partial, if anything blocks it). This panel's
 * only job is to make triggering it deliberate: typing the exact phrase
 * is required before the button even enables, matching the server's own
 * check — a slipped click alone can never fire this.
 */
function ResetRosterPanel() {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetRosterResult | null>(null);

  const canSubmit = phrase === RESET_CONFIRM_PHRASE && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (!window.confirm("This permanently deletes every real partner, application, and creator account. Continue?")) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/system/reset-founding-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: phrase }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Reset failed.");
      setResult(body);
      setPhrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Reset Roster</h2>
      <p style={mutedSmallStyle}>
        Permanently deletes every real Founding Partner, every Founding Baddie application, and every creator
        account (including the current dummy roster) — then reseeds exactly 5 demo creator accounts. This cannot be
        undone. Financial history (ledger entries, payouts) tied to any removed account is deleted as part of this,
        not archived.
      </p>

      <div style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.75rem", marginTop: "1rem" }}>
        <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          Type <code>{RESET_CONFIRM_PHRASE}</code> to enable the reset button
        </label>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={RESET_CONFIRM_PHRASE}
          style={{ ...memberSearchInputStyle, flex: "none" }}
          disabled={busy}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...rejectButtonStyle,
            background: canSubmit ? "var(--danger)" : "transparent",
            color: canSubmit ? "#fff" : "var(--text-muted)",
            borderColor: canSubmit ? "var(--danger)" : "var(--border)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Resetting..." : "Permanently reset roster"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}

      {result && (
        <div style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.4rem", marginTop: "1rem" }}>
          <span style={{ fontWeight: 600, color: "var(--success)" }}>Reset complete.</span>
          <span style={mutedSmallStyle}>
            Removed {result.deleted.usersRemoved} account(s) — {result.deleted.partnersRemoved} partner(s),{" "}
            {result.deleted.creatorsRemoved} creator(s) — and {result.deleted.applicationsRemoved} application(s).
          </span>
          <span style={mutedSmallStyle}>
            {result.reseeded
              ? `Reseeded ${result.seededCreatorCount} demo creator accounts.`
              : `Reseed did not fully complete: ${result.reseedError}. Safe to trigger this reset again — the reseed step is idempotent.`}
          </span>
        </div>
      )}
    </section>
  );
}

interface PartnerInvitationRow {
  id: string;
  name: string;
  email: string | null;
  code: string;
  status: string;
  invitedByEmail: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  resentAt: string | null;
  resendCount: number;
  createdAt: string;
  foundingPartnerId: string | null;
}

interface PartnerLedgerEntryRow {
  id: string;
  type: string;
  grossAmount: string;
  creatorShareAmount: string | null;
  platformShareAmount: string | null;
  createdAt: string;
}

interface ReferredCreatorRow {
  foundingApplicationId: string;
  stageName: string;
  email: string;
  status: string;
  correctedBy: string | null;
  correctionReason: string | null;
}

interface FoundingPartnerRow {
  id: string;
  email: string;
  referralCode: string;
  status: string;
  activatedAt: string;
  joinedPositionNumber: number | null;
  referredCreators: ReferredCreatorRow[];
  ledgerEntryCount: number;
  ledgerEntries: PartnerLedgerEntryRow[];
  agreement: { version: string; acceptedAt: string } | null;
  commissionSummary: { lifetimeUsd: number; pendingUsd: number; payableUsd: number; paidUsd: number };
  earningPeriods: { active: number; expired: number };
}

/**
 * The private Founding Partner programme: invitation CRUD (create/revoke/
 * resend), the partner roster with embedded referral + reward detail, and
 * suspend/reactivate. Not paginated anywhere — the whole programme is
 * capped at 50 partners (Founding Partner Programme v2), so both lists
 * stay small by construction. Same reload()/busyId queue pattern as every
 * other admin panel in this file. Also renders the v2 Referrals,
 * Commission Management, and Reporting sub-sections below the roster.
 */
function FoundingPartnersPanel() {
  const [invitations, setInvitations] = useState<PartnerInvitationRow[]>([]);
  const [partners, setPartners] = useState<FoundingPartnerRow[]>([]);
  const [positionsFilled, setPositionsFilled] = useState(0);
  const [positionsLimit, setPositionsLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  // Optional — see PartnerInvitation's own schema comment on why email
  // can't be required here (admin won't have one for everyone).
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [inviting, setInviting] = useState(false);
  // Surfaces the real, working invite link after sending/resending —
  // never solely dependent on an invite email existing/landing (see the
  // invitations routes' own comment: no address at all, a sandboxed
  // provider, a typo, a spam filter can all mean no email ever arrives).
  // Copyable so it can go out via DM, WhatsApp, anywhere.
  const [inviteLinkInfo, setInviteLinkInfo] = useState<
    { name: string; code: string; url: string; emailSent: boolean; hadEmail: boolean } | null
  >(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/partners/invitations").then((r) => (r.ok ? r.json() : { invitations: [] })),
      fetch("/api/admin/partners").then((r) => (r.ok ? r.json() : { partners: [] })),
    ])
      .then(([invBody, partnerBody]) => {
        setInvitations(invBody.invitations ?? []);
        setPartners(partnerBody.partners ?? []);
        setPositionsFilled(partnerBody.positionsFilled ?? 0);
        setPositionsLimit(partnerBody.positionsLimit ?? 50);
      })
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const sentToName = name;
    const res = await fetch("/api/admin/partners/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: email || undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      }),
    });
    setInviting(false);
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.inviteUrl) {
        setInviteLinkInfo({
          name: sentToName,
          code: body.code,
          url: body.inviteUrl,
          emailSent: Boolean(body.emailSent),
          hadEmail: Boolean(email),
        });
        setLinkCopied(false);
      }
      setName("");
      setEmail("");
      reload();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error && typeof body.error === "string" ? body.error : "Couldn't send invitation.");
    }
  }

  async function revokeInvite(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/partners/invitations/${id}/revoke`, { method: "POST" });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Revoke failed.");
    }
  }

  async function resendInvite(id: string) {
    setBusyId(id);
    const invitation = invitations.find((inv) => inv.id === id);
    const res = await fetch(`/api/admin/partners/invitations/${id}/resend`, { method: "POST" });
    setBusyId(null);
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.inviteUrl) {
        setInviteLinkInfo({
          name: invitation?.name ?? "",
          code: invitation?.code ?? "",
          url: body.inviteUrl,
          emailSent: Boolean(body.emailSent),
          hadEmail: Boolean(invitation?.email),
        });
        setLinkCopied(false);
      }
      reload();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Resend failed.");
    }
  }

  async function copyInviteLink() {
    if (!inviteLinkInfo) return;
    try {
      await navigator.clipboard.writeText(inviteLinkInfo.url);
      setLinkCopied(true);
    } catch {
      // Clipboard permission denied or unavailable — the link is still
      // selectable text in the banner below, so this isn't a dead end.
    }
  }

  async function toggleSuspend(id: string, currentlyActive: boolean) {
    setBusyId(id);
    const res = await fetch(`/api/admin/partners/${id}/${currentlyActive ? "suspend" : "reactivate"}`, { method: "POST" });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Action failed.");
    }
  }

  const activePartnerCount = partners.filter((p) => p.status === "ACTIVE").length;
  const pendingInviteCount = invitations.filter((i) => i.status === "PENDING").length;
  const positionsPct = positionsLimit > 0 ? Math.min(100, (positionsFilled / positionsLimit) * 100) : 0;

  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2 style={sectionHeadingStyle}>Founding Partners</h2>
      <p style={mutedSmallStyle}>
        {activePartnerCount} active · {pendingInviteCount} pending invitation{pendingInviteCount === 1 ? "" : "s"}
      </p>

      <div style={{ ...foundingProgressWrapStyle, marginTop: "1rem" }}>
        <div style={foundingProgressBarOuterStyle}>
          <div style={{ ...foundingProgressBarInnerStyle, width: `${positionsPct}%` }} />
        </div>
        <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          {positionsFilled} / {positionsLimit}{" "}
          <span style={{ ...mutedSmallStyle, display: "inline" }}> Founding Partner positions filled</span>
        </div>
      </div>

      <form onSubmit={sendInvite} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0 2rem" }}>
        <input
          type="text"
          style={memberSearchInputStyle}
          placeholder="Invitee name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          style={memberSearchInputStyle}
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select style={statusSelectStyle} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
          <option value="">No expiry</option>
          <option value="7">Expires in 7 days</option>
          <option value="14">Expires in 14 days</option>
          <option value="30">Expires in 30 days</option>
        </select>
        <button type="submit" style={approveButtonStyle} disabled={inviting}>
          {inviting ? "Sending..." : "Send invitation"}
        </button>
      </form>

      {inviteLinkInfo && (
        <div
          style={{
            background: "var(--surface-raised)",
            border: `1px solid ${inviteLinkInfo.hadEmail && !inviteLinkInfo.emailSent ? "var(--danger)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            padding: "0.9rem 1rem",
            marginBottom: "2rem",
          }}
        >
          <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            {!inviteLinkInfo.hadEmail ? (
              <>
                Invite link for <strong>{inviteLinkInfo.name}</strong> (code <code>{inviteLinkInfo.code}</code>) — no
                email on file, so copy this link and send it directly (DM, WhatsApp, in person, wherever reaches them).
              </>
            ) : inviteLinkInfo.emailSent ? (
              <>
                Invite link for <strong>{inviteLinkInfo.name}</strong> (code <code>{inviteLinkInfo.code}</code>) — the
                email was sent too, but you can copy this and send it yourself as well.
              </>
            ) : (
              <>
                <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                  The invite email for {inviteLinkInfo.name} failed to send
                </span>{" "}
                — check the server logs for why (e.g. a sandboxed notification provider). The invitation itself
                still exists — copy this link and send it directly instead.
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              readOnly
              value={inviteLinkInfo.url}
              onFocus={(e) => e.target.select()}
              style={{ ...memberSearchInputStyle, flex: 1, minWidth: "260px", fontSize: "0.82rem" }}
            />
            <button type="button" onClick={copyInviteLink} style={approveButtonStyle}>
              {linkCopied ? "Copied ✓" : "Copy link"}
            </button>
            <button type="button" onClick={() => setInviteLinkInfo(null)} style={rejectButtonStyle}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : (
        <>
          <h3 style={statGroupHeadingStyle}>Invitations</h3>
          {invitations.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No invitations sent yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "2rem" }}>
              {invitations.map((inv) => (
                <div key={inv.id} style={rowCardStyle}>
                  <div>
                    <div style={{ fontSize: "0.9rem" }}>
                      {inv.name} · code <code>{inv.code}</code>
                    </div>
                    <div style={mutedSmallStyle}>
                      {inv.status} · invited by {inv.invitedByEmail} · {new Date(inv.createdAt).toLocaleDateString()}
                      {inv.email && ` · ${inv.email}`}
                      {inv.expiresAt && ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                      {inv.resendCount > 0 && ` · resent ${inv.resendCount}x`}
                    </div>
                  </div>
                  {inv.status === "PENDING" && (
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button onClick={() => resendInvite(inv.id)} disabled={busyId === inv.id} style={approveButtonStyle}>
                        Resend
                      </button>
                      <button onClick={() => revokeInvite(inv.id)} disabled={busyId === inv.id} style={rejectButtonStyle}>
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3 style={statGroupHeadingStyle}>Partners</h3>
          {partners.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No activated partners yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {partners.map((p) => (
                <div key={p.id} style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                    <div>
                      <div style={{ fontSize: "0.9rem" }}>
                        {p.email}
                        {p.joinedPositionNumber != null && ` · #${p.joinedPositionNumber}`}
                      </div>
                      <div style={mutedSmallStyle}>
                        {p.status} · code <code>{p.referralCode}</code> · activated {new Date(p.activatedAt).toLocaleDateString()} ·{" "}
                        {p.referredCreators.length} referred creator{p.referredCreators.length === 1 ? "" : "s"} ·{" "}
                        {p.ledgerEntryCount} ledger event{p.ledgerEntryCount === 1 ? "" : "s"} · agreement{" "}
                        {p.agreement ? `${p.agreement.version} accepted ${new Date(p.agreement.acceptedAt).toLocaleDateString()}` : "not on file"}
                      </div>
                      <div style={mutedSmallStyle}>
                        commission — lifetime ${p.commissionSummary.lifetimeUsd.toFixed(2)} · pending $
                        {p.commissionSummary.pendingUsd.toFixed(2)} · payable ${p.commissionSummary.payableUsd.toFixed(2)}{" "}
                        · paid ${p.commissionSummary.paidUsd.toFixed(2)} · earning periods {p.earningPeriods.active} active /{" "}
                        {p.earningPeriods.expired} expired
                      </div>
                    </div>
                    <button
                      onClick={() => toggleSuspend(p.id, p.status === "ACTIVE")}
                      disabled={busyId === p.id}
                      style={p.status === "ACTIVE" ? rejectButtonStyle : approveButtonStyle}
                    >
                      {p.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                    </button>
                  </div>
                  {p.referredCreators.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {p.referredCreators.map((c) => (
                        <span key={c.foundingApplicationId} style={filterChipStyle}>
                          {c.stageName} · {humanizeKey(c.status)}
                          {c.correctedBy && " (corrected)"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PartnerReportingSection />
      <PartnerReferralsSection />
      <PartnerCommissionManagementSection />
    </section>
  );
}

interface PartnerReportRow {
  totalFoundingBaddies: number;
  target: number;
  remainingToTarget: number;
  totalReferredByPartners: number;
  topPartners: { partnerId: string; partnerEmail: string; referralCode: string; creatorsReferred: number }[];
}

/** Founding Baddie / Founding Partner recruitment reporting (spec §7) — see GET /api/admin/partners/report for exactly what each figure means. */
function PartnerReportingSection() {
  const [report, setReport] = useState<PartnerReportRow | null>(null);

  useEffect(() => {
    fetch("/api/admin/partners/report")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport);
  }, []);

  if (!report) return null;

  return (
    <div style={{ marginTop: "2.5rem" }}>
      <StatGroup title="Reporting">
        <Stat label="Total Founding Baddies" value={report.totalFoundingBaddies} />
        <Stat label="Referred by a Partner" value={report.totalReferredByPartners} />
        <Stat label="Remaining to target" value={report.remainingToTarget} />
        <Stat label="Target" value={report.target} />
      </StatGroup>
      {report.topPartners.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ ...mutedSmallStyle, marginBottom: "0.5rem" }}>Top Partners by recruitment</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {report.topPartners.map((p) => (
              <div key={p.partnerId} style={rowCardStyle}>
                <span style={{ fontSize: "0.88rem" }}>{p.partnerEmail}</span>
                <span style={filterChipStyle}>{p.creatorsReferred} referred</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PartnerReferralRow {
  referralAttributionId: string;
  partnerEmail: string;
  partnerReferralCode: string;
  stageName: string;
  creatorEmail: string;
  creatorStatus: string;
  referredAt: string;
  attributedAt: string;
  correctedBy: string | null;
  correctionReason: string | null;
  subscriptionRevenueGeneratedUsd: number;
  commissionGeneratedUsd: number;
  earningPeriodStartAt: string | null;
  earningPeriodEndAt: string | null;
  earningPeriodStatus: "NOT_STARTED" | "ACTIVE" | "EXPIRED";
}

/** Flat, filterable referral list (spec §8 "Referrals") — see GET /api/admin/partners/referrals. */
function PartnerReferralsSection() {
  const [referrals, setReferrals] = useState<PartnerReferralRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    fetch(`/api/admin/partners/referrals${qs}`)
      .then((r) => (r.ok ? r.json() : { referrals: [] }))
      .then((body) => setReferrals(body.referrals ?? []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div style={{ marginTop: "2.5rem" }}>
      <h3 style={statGroupHeadingStyle}>Referrals ({referrals.length})</h3>
      <select
        style={{ ...statusSelectStyle, marginBottom: "1rem" }}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="LIVE">Live</option>
        <option value="VERIFIED">Verified</option>
        <option value="APPROVED">Approved</option>
        <option value="ONBOARDING">Onboarding</option>
        <option value="REJECTED">Rejected</option>
      </select>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : referrals.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No referrals match this filter.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {referrals.map((r) => (
            <div key={r.referralAttributionId} style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span style={{ fontSize: "0.88rem" }}>
                  {r.stageName} ← {r.partnerEmail}
                </span>
                <span style={filterChipStyle}>{humanizeKey(r.creatorStatus)}</span>
              </div>
              <div style={mutedSmallStyle}>
                referred {new Date(r.referredAt).toLocaleDateString()} · attributed {new Date(r.attributedAt).toLocaleDateString()}
                {r.correctedBy && " · attribution corrected"} · revenue ${r.subscriptionRevenueGeneratedUsd.toFixed(2)} · commission $
                {r.commissionGeneratedUsd.toFixed(2)}
                {r.earningPeriodStartAt && r.earningPeriodEndAt && (
                  <>
                    {" "}
                    · earning period {new Date(r.earningPeriodStartAt).toLocaleDateString()} –{" "}
                    {new Date(r.earningPeriodEndAt).toLocaleDateString()} ({r.earningPeriodStatus.toLowerCase()})
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PartnerCommissionRow {
  id: string;
  partnerId: string;
  partnerEmail: string;
  creatorStageName: string;
  creatorEmail: string;
  netEligibleAmountUsd: number;
  commissionAmountUsd: number;
  reversedAmountUsd: number;
  status: string;
  heldBy: string | null;
  heldReason: string | null;
  heldAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
}

/**
 * Commission ledger review (spec §8/§9/§10): hold a PENDING commission
 * for investigation, release a HELD one back to PENDING, or manually
 * reverse one believed fraudulent — never an automatic confiscation.
 * Every action prompts for a reason (window.prompt, same pattern as
 * every other admin reject/reason flow in this file) and is logged
 * server-side with actor/timestamp/reason/amount-before/amount-after.
 */
function PartnerCommissionManagementSection() {
  const [commissions, setCommissions] = useState<PartnerCommissionRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    fetch(`/api/admin/partner-commissions${qs}`)
      .then((r) => (r.ok ? r.json() : { commissions: [] }))
      .then((body) => setCommissions(body.commissions ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [statusFilter]);

  async function act(id: string, action: "hold" | "release" | "reverse") {
    const reason = window.prompt(
      action === "hold"
        ? "Why are you holding this commission?"
        : action === "release"
          ? "Why are you releasing this commission?"
          : "Why are you reversing this commission? This cannot be undone."
    );
    if (!reason) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/partner-commissions/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error && typeof body.error === "string" ? body.error : "Action failed.");
    }
  }

  return (
    <div style={{ marginTop: "2.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 style={{ ...statGroupHeadingStyle, margin: 0 }}>Commission management</h3>
        <a
          href={`/api/admin/partner-commissions/export${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ""}`}
          style={{ ...filterChipStyle, textDecoration: "none" }}
        >
          Export CSV ↓
        </a>
      </div>
      <select
        style={{ ...statusSelectStyle, margin: "1rem 0" }}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="PENDING">Pending</option>
        <option value="HELD">Held</option>
        <option value="REVERSED">Reversed</option>
        <option value="">All</option>
      </select>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : commissions.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No commissions match this filter.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {commissions.map((c) => (
            <div key={c.id} style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ fontSize: "0.88rem" }}>
                    {c.creatorStageName} ← {c.partnerEmail}
                  </div>
                  <div style={mutedSmallStyle}>
                    net ${c.netEligibleAmountUsd.toFixed(2)} · commission ${c.commissionAmountUsd.toFixed(2)} · reversed $
                    {c.reversedAmountUsd.toFixed(2)} · {new Date(c.createdAt).toLocaleDateString()}
                    {c.heldReason && ` · held: ${c.heldReason}`}
                    {c.reversalReason && ` · reversal: ${c.reversalReason}`}
                  </div>
                </div>
                <span style={filterChipStyle}>{c.status}</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {c.status === "PENDING" && (
                  <button onClick={() => act(c.id, "hold")} disabled={busyId === c.id} style={rejectButtonStyle}>
                    Hold
                  </button>
                )}
                {c.status === "HELD" && (
                  <button onClick={() => act(c.id, "release")} disabled={busyId === c.id} style={approveButtonStyle}>
                    Release
                  </button>
                )}
                {c.status !== "REVERSED" && (
                  <button onClick={() => act(c.id, "reverse")} disabled={busyId === c.id} style={rejectButtonStyle}>
                    Reverse
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

  async function reviewVerification(id: string, kind: "IDENTITY_AGE" | "LIVENESS", decision: "PASSED" | "FAILED") {
    const failureReason =
      decision === "FAILED" ? window.prompt("Reason (shown to no one but admins, optional):") ?? undefined : undefined;
    setBusyId(id);
    const res = await fetch(`/api/admin/creators/${id}/verification-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, decision, failureReason }),
    });
    setBusyId(null);
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't submit verification review.");
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
                {app.identityDetails && (
                  <div style={mutedSmallStyle}>
                    DOB {new Date(app.identityDetails.dateOfBirth).toLocaleDateString()} ·{" "}
                    {app.identityDetails.nationality} · ID {app.identityDetails.maskedIdNumber}
                    {app.identityDocumentUrl && (
                      <>
                        {" · "}
                        <a href={app.identityDocumentUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          View ID document ↗
                        </a>
                      </>
                    )}
                  </div>
                )}
                {app.identityAgeReviewUrl && (
                  <div style={{ marginTop: "0.4rem" }}>
                    <a href={app.identityAgeReviewUrl} target="_blank" rel="noreferrer" style={{ ...filterChipStyle, textDecoration: "none" }}>
                      View identity+age photo ↗
                    </a>
                  </div>
                )}
                {app.livenessReviewUrl && (
                  <div style={{ marginTop: "0.4rem" }}>
                    <a href={app.livenessReviewUrl} target="_blank" rel="noreferrer" style={{ ...filterChipStyle, textDecoration: "none" }}>
                      View liveness video ↗
                    </a>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap" }}>
                {app.identityAgeReviewUrl && (
                  <>
                    <button
                      onClick={() => reviewVerification(app.creatorProfileId, "IDENTITY_AGE", "PASSED")}
                      disabled={busyId === app.creatorProfileId}
                      style={approveButtonStyle}
                    >
                      Approve identity+age
                    </button>
                    <button
                      onClick={() => reviewVerification(app.creatorProfileId, "IDENTITY_AGE", "FAILED")}
                      disabled={busyId === app.creatorProfileId}
                      style={rejectButtonStyle}
                    >
                      Reject identity+age
                    </button>
                  </>
                )}
                {app.livenessReviewUrl && (
                  <>
                    <button
                      onClick={() => reviewVerification(app.creatorProfileId, "LIVENESS", "PASSED")}
                      disabled={busyId === app.creatorProfileId}
                      style={approveButtonStyle}
                    >
                      Approve liveness
                    </button>
                    <button
                      onClick={() => reviewVerification(app.creatorProfileId, "LIVENESS", "FAILED")}
                      disabled={busyId === app.creatorProfileId}
                      style={rejectButtonStyle}
                    >
                      Reject liveness
                    </button>
                  </>
                )}
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

// mainStyle stays in use for the pre-dashboard states (loading/sign-in-
// required/wrong-role) above — only the real dashboard below switches to
// the two-column shell.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "1100px", margin: "0 auto" };

const adminShellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "2rem",
  maxWidth: "1400px",
  margin: "0 auto",
  padding: "2rem 1.75rem 4rem",
};

const adminSidebarStyle: React.CSSProperties = {
  width: "230px",
  flexShrink: 0,
  position: "sticky",
  top: "1.5rem",
};

const adminBrandRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.2rem 0.2rem 1.25rem",
};

const adminBrandMarkStyle: React.CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "3px",
  background: "linear-gradient(135deg, var(--accent), #a855f7)",
  flexShrink: 0,
};

const adminBrandTextStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "0.98rem",
  fontWeight: 600,
};

const adminContentStyle: React.CSSProperties = { flex: 1, minWidth: 0 };

const adminContentHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  paddingBottom: "1.1rem",
  marginBottom: "2rem",
  borderBottom: "2px solid var(--border)",
};

const adminContentEyebrowStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const navGroupsWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.35rem",
};

const navGroupSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const navGroupItemsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
};

const navGroupLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  padding: "0 0.6rem 0.35rem",
};

const navGroupDotStyle: React.CSSProperties = {
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  flexShrink: 0,
};

/** A full-width sidebar row rather than a pill — active state borrows
 * the owning group's own color (left border + soft background tint)
 * instead of the single blue accent everything else in the shell uses,
 * so a glance at the sidebar alone says which part of the business is
 * open. */
function sidebarTabStyle(active: boolean, groupColor: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    background: active ? `${groupColor}1a` : "transparent",
    border: "none",
    borderLeft: `2px solid ${active ? groupColor : "transparent"}`,
    color: active ? "var(--text)" : "var(--text-muted)",
    borderRadius: "0 8px 8px 0",
    padding: "0.5rem 0.6rem",
    fontSize: "0.85rem",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
  };
}

const sidebarTabDisabledStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-muted)",
  borderLeft: "2px solid transparent",
  padding: "0.5rem 0.6rem",
  fontSize: "0.85rem",
  opacity: 0.5,
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

const filterCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "1rem 1.1rem 0.4rem",
  marginBottom: "1.25rem",
};

const filterCardLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: "0.7rem",
};

const memberFilterBarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  marginBottom: "0.85rem",
};

// Same People-section purple as the sidebar (see NAV_GROUPS) for
// CREATOR/PARTNER — role is exactly the kind of at-a-glance category
// this admin shell's new color system exists for; FAN/ADMIN stay
// neutral since there's nothing to distinguish them by color for.
function roleBadgeStyle(role: string): React.CSSProperties {
  const isSpecial = role === "CREATOR" || role === "PARTNER";
  return {
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: isSpecial ? "#a855f7" : "var(--text-muted)",
    border: `1px solid ${isSpecial ? "#a855f7" : "var(--border)"}`,
    borderRadius: "999px",
    padding: "0.1rem 0.5rem",
  };
}

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

const resolutionTextareaStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "480px",
  minHeight: "80px",
  marginTop: "0.75rem",
  marginBottom: "0.75rem",
  padding: "0.6rem 0.7rem",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  fontSize: "0.85rem",
  fontFamily: "inherit",
  resize: "vertical",
};
