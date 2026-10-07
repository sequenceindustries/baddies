"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "motion/react";
import { transitions } from "@/lib/motion/tokens";
import { useSession, displayHeadingStyle, SignInGate, AnimatedNumber, SkeletonBlock } from "@/components/ui";

interface CreatorApplication {
  creatorProfileId: string;
  status: string;
  appliedAt: string;
  applicantEmail: string;
  confirmsFemale: boolean;
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

const TABS = ["Overview", "Members", "Creators", "Fans", "Applications", "Content", "Revenue", "Payouts", "Trust & Safety", "Activity", "Audit Log", "System Health", "Wipe Test Content", "Delete Fan Accounts"] as const;
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
  actionRequired: { id: string; label: string; count: number; linkTab: Tab | null }[];
  badges: { applications: number; content: number; payouts: number; trustSafety: number };
  charts: { newUsers: DayCount[]; newCreators: DayCount[]; newContent: DayCount[] };
  recentActivity: { id: string; kind: string; label: string; actor: string | null; timestamp: string }[];
}

// Reorganizes the flat tab bar into the grouped nav a "command centre"
// calls for — but only the tabs that actually exist this phase are
// clickable (no `tab` field). The rest render as a visibly disabled
// "soon" pill rather than linking to a page that isn't built yet
// (Revenue and System Health likewise got their own pages later).
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
      { label: "Fans", tab: "Fans" },
      { label: "Applications", tab: "Applications", badgeKey: "applications" },
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
    items: [
      { label: "Trust & Safety", tab: "Trust & Safety", badgeKey: "trustSafety" },
      { label: "Activity", tab: "Activity" },
      { label: "Audit Log", tab: "Audit Log" },
    ],
  },
  {
    label: "System",
    color: "#94a3b8",
    items: [
      { label: "System Health", tab: "System Health" },
      { label: "Wipe Test Content", tab: "Wipe Test Content" },
      { label: "Delete Fan Accounts", tab: "Delete Fan Accounts" },
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
          <span style={{ ...navGroupLabelStyle, color: group.color, borderBottom: `2px solid ${group.color}33` }}>
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
 * front: KPIs, Action Required, growth charts, and recent activity, all from one GET /api/admin/command-centre call. Every
 * number there is a real query — a metric with nothing behind it reads
 * as 0 or "—", never an invented figure.
 */
export default function AdminDashboardPage() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState<Tab>("Overview");
  // Mobile-only: the sidebar's 12 tabs stacked above the content (see
  // .admin-sidebar's own comment on why it stacks below 860px) used to
  // mean scrolling nearly a full screen of nav before reaching any
  // content. Collapsed by default on that breakpoint — a toggle row
  // shows the current tab and expands the full grouped list on tap,
  // matching the "collapsible drawer" this was always meant to become.
  // Ignored above 860px (CSS keeps the full sidebar always visible
  // there regardless of this flag — see .admin-nav-groups.collapsed).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("7d");
  const [ccData, setCcData] = useState<CommandCentreData | null>(null);
  const [ccLoading, setCcLoading] = useState(true);
  const [ccError, setCcError] = useState<string | null>(null);

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
        <button
          type="button"
          className="admin-nav-toggle"
          style={adminNavToggleStyle}
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-expanded={mobileNavOpen}
        >
          <span>{tab}</span>
          <span aria-hidden="true" style={{ transform: mobileNavOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
            ▾
          </span>
        </button>
        <div className={`admin-nav-groups${mobileNavOpen ? "" : " collapsed"}`}>
          <NavGroups
            tab={tab}
            onSelect={(t) => {
              setTab(t);
              setMobileNavOpen(false);
            }}
            badges={ccData?.badges}
          />
        </div>
      </aside>

      <main className="admin-content" style={adminContentStyle}>
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
          />
        )}
        {tab === "Members" && <MembersPanel />}
        {tab === "Creators" && <MembersPanel lockedRole="CREATOR" />}
        {tab === "Fans" && <MembersPanel lockedRole="FAN" />}
        {tab === "Applications" && <CreatorQueue />}
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
        {tab === "Activity" && <ActivityPanel data={ccData} loading={ccLoading} error={ccError} />}
        {tab === "Audit Log" && <AuditLogPanel />}
        {tab === "System Health" && <SystemHealthPanel />}
        {tab === "Wipe Test Content" && <WipeTestContentPanel />}
        {tab === "Delete Fan Accounts" && <DeleteFanAccountsPanel />}
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

function OverviewPanel({
  data,
  loading,
  error,
  range,
  onRangeChange,
  onNavigate,
}: {
  data: CommandCentreData | null;
  loading: boolean;
  error: string | null;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  onNavigate: (tab: Tab) => void;
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

      {loading && (
        <div className="overview-stat-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} height="5.5rem" />
          ))}
        </div>
      )}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transitions.standard}>
          {/* What needs YOUR attention, first — before any general
              health metrics. Its own heading carries the same total
              openIssues used to show as a disconnected 6th KPI card
              below (openModerationCases +
              pendingCreatorReview + pendingPayouts, see command-centre/
              route.ts) — that was the same number shown twice, in two
              unconnected places, at two different levels of detail.
              One count, attached to its own real breakdown, instead. */}
          <ActionRequiredSection items={data.actionRequired} openIssues={data.kpis.openIssues} onNavigate={onNavigate} />

          {/* Platform health — the numbers an admin skims after acting
              on anything urgent above. Fewer, larger cards than a wall
              of equally-weighted stats; clickable where a real
              destination exists. Fixed 5-column grid (.overview-stat-
              grid, globals.css) rather than heroStatGridStyle's
              auto-fit — auto-fit strands a card alone on an otherwise-
              empty row the moment the card count and window width don't
              divide evenly, which is exactly what happened with the old
              6th "Open issues" card (now moved above, into its own
              section) at typical desktop widths. */}
          <section style={{ marginBottom: "2.5rem" }}>
            <h2 style={sectionHeadingStyle}>Platform</h2>
            <div className="overview-stat-grid">
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
            </div>
          </section>

          <section style={{ marginBottom: "2.5rem" }}>
            <h2 style={sectionHeadingStyle}>Growth</h2>
            <div style={chartGridStyle}>
              <GrowthChart title="New users" data={data.charts.newUsers} />
              <GrowthChart title="New creators" data={data.charts.newCreators} />
              <GrowthChart title="New content" data={data.charts.newContent} />
            </div>
            {/* No revenue chart — nothing to chart yet (see the Revenue
                KPI card above). It appears here on its own once there's
                real ledger activity to plot. */}
            <p style={mutedSmallStyle}>Revenue: {money(data.kpis.revenue.allTimeUsd)} all-time.</p>
          </section>
        </motion.div>
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
      <div style={heroStatValueStyle}>
        <KpiValue value={value} />
      </div>
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

// Count-up for KpiCard's value — used sparingly per the product brief's
// own "don't overdo this" instruction, and this is the one place real
// numeric KPIs exist anywhere in the app (no public-facing stat/social-
// proof section exists on the landing page today, confirmed while
// scoping this upgrade). KpiCard's own `value` prop is already a
// pre-formatted string ("$1,234.00", "12", "—") from each caller
// (OverviewPanel, RevenuePanel) — rather than changing that API and
// touching every call site, this parses the formatted string back into
// a number + prefix/suffix, animates the number, and reapplies the same
// prefix/suffix/decimal-precision on every tick. Anything that doesn't
// parse as a real number (e.g. "—" for missing data) renders as plain
// text, unanimated — never a broken or misleading count-up.
function KpiValue({ value }: { value: string }) {
  const match = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)([^\d%]*)$/);
  if (!match) return <>{value}</>;
  const [, prefix, numStr, suffix] = match;
  if (!numStr) return <>{value}</>;
  const decimals = numStr.includes(".") ? numStr.split(".")[1]!.length : 0;
  const num = Number(numStr.replace(/,/g, ""));
  if (Number.isNaN(num)) return <>{value}</>;
  return (
    <AnimatedNumber
      value={num}
      format={(n) =>
        `${prefix}${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
      }
    />
  );
}

function ActionRequiredSection({
  items,
  openIssues,
  onNavigate,
}: {
  items: CommandCentreData["actionRequired"];
  openIssues: number;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2 style={sectionHeadingStyle}>
        Action required
        {openIssues > 0 && <span style={{ color: "var(--danger)" }}> ({openIssues})</span>}
      </h2>
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

/**
 * Its own page now (moved out of the Overview tab, per direct request) —
 * a live feed of admin actions, signups, applications, uploads, and
 * approvals blended together, same 20-item/5-source query the Overview
 * tab used to embed (GET /api/admin/command-centre's `recentActivity`,
 * already fetched once by the parent regardless of which tab is active,
 * so this reads the same in-flight data rather than firing a second
 * request). Not range-filtered — the underlying query always returns
 * the 20 most recent events regardless of the KPI date range picker.
 */
function ActivityPanel({
  data,
  loading,
  error,
}: {
  data: CommandCentreData | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section>
      <p style={mutedSmallStyle}>Admin actions, signups, applications, uploads, and approvals, most recent first.</p>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {data &&
        (data.recentActivity.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Nothing yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {data.recentActivity.map((item) => (
              <div key={item.id} style={auditRowStyle}>
                <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{item.label}</span>
                <span style={mutedSmallStyle}>
                  {item.actor ?? "system"} · {new Date(item.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ))}
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
function MembersPanel({ lockedRole }: { lockedRole?: "CREATOR" | "FAN" }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(lockedRole ?? "");
  const [status, setStatus] = useState("");
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

  const nounPlural = lockedRole === "CREATOR" ? "Creators" : lockedRole === "FAN" ? "Fans" : "Members";
  const nounSingularLower = lockedRole === "CREATOR" ? "creator" : lockedRole === "FAN" ? "fan" : "member";
  const nounPluralLower = lockedRole === "CREATOR" ? "creators" : lockedRole === "FAN" ? "fans" : "members";

  return (
    <section>
      <h2 style={sectionHeadingStyle}>{nounPlural}</h2>

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
        <p style={{ color: "var(--text-muted)" }}>No {nounPluralLower} match.</p>
      ) : (
        <>
          <p style={mutedSmallStyle}>
            Showing {members.length} {members.length === 1 ? nounSingularLower : nounPluralLower}
            {cursor ? " (more available)" : ""}.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {members.map((m) => (
              <MemberRowCard key={m.userId} m={m} busyId={busyId} onSelect={setSelectedUserId} onAct={act} />
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

/** One member/creator row — extracted from MembersPanel's own JSX so
 * both the flat Members/Fans list and CreatorGroups' three grouped
 * sections below render identical rows from one definition. */
function MemberRowCard({
  m,
  busyId,
  onSelect,
  onAct,
}: {
  m: MemberRow;
  busyId: string | null;
  onSelect: (userId: string) => void;
  onAct: (userId: string, action: "suspend" | "ban") => void;
}) {
  return (
    <div style={rowCardStyle}>
      <div style={rowInfoClickableStyle} onClick={() => onSelect(m.userId)} role="button">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
          {m.displayName ?? m.email}
          <span style={roleBadgeStyle(m.role)}>{humanizeKey(m.role)}</span>
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
          <button onClick={() => onAct(m.userId, "suspend")} disabled={busyId === m.userId} style={rejectButtonStyle}>
            Suspend
          </button>
          <button onClick={() => onAct(m.userId, "ban")} disabled={busyId === m.userId} style={rejectButtonStyle}>
            Ban
          </button>
        </div>
      )}
    </div>
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

  async function approve(id: string, manualReference?: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/payouts/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualReference ? { manualReference } : {}),
    });
    setBusyId(null);
    if (res.ok) {
      reload();
      return;
    }
    const body = await res.json().catch(() => null);
    // Payouts are paid outside baddies (no provider payout API) — the
    // admin confirms with the reference of the payment they made.
    if (body?.manualRequired && !manualReference) {
      const reference = window.prompt(
        "Payouts are sent outside baddies. Once you've paid this creator, enter the payment reference (EFT reference or transaction hash):"
      );
      if (reference?.trim()) await approve(id, reference.trim());
      return;
    }
    alert(body?.error ?? "Approve failed.");
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
                <div style={rowInfoClickableStyle} onClick={() => setSelectedCase(c)} role="button">
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
      <AbuseFlagsSection />
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
  providers: {
    payment: { name: string; isStub: boolean };
    storage: { name: string; isStub: boolean };
    verification: { name: string; isStub: boolean };
    notification: { name: string; isStub: boolean };
  };
  googleSignInConfigured: boolean;
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
            <KpiCard label="Uptime" value={formatUptime(data.runtime.uptimeSeconds)} caption={data.runtime.nodeEnv} />
            <KpiCard label="App version" value={data.runtime.appVersion} caption={data.runtime.nodeVersion} />
          </div>

          <StatGroup title="Configured providers">
            <Stat label="Payment" value={data.providers.payment.name} alert={data.providers.payment.isStub} />
            <Stat label="Storage" value={data.providers.storage.name} alert={data.providers.storage.isStub} />
            <Stat label="Verification" value={data.providers.verification.name} alert={data.providers.verification.isStub} />
            <Stat label="Email" value={data.providers.notification.name} alert={data.providers.notification.isStub} />
            <Stat label="Google sign-in" value={data.googleSignInConfigured ? "Configured" : "Not configured"} alert={!data.googleSignInConfigured} />
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

interface WipeTestContentResult {
  contentAffected: number;
  mediaAssetsReplaced: number;
  creatorsAffected: number;
}

const WIPE_CONFIRM_PHRASE = "WIPE TEST CONTENT";

/**
 * Replaces every stray
 * (non-official-demo) creator's posted photo with the brand wordmark, in
 * place, without deleting their accounts — see
 * POST /api/admin/system/wipe-test-content's own doc comment for exact
 * scope (IMAGE content only; the 5 official DUMMY_CREATORS are never
 * touched). "Type the exact phrase" second-step confirmation: this
 * overwrites real stored bytes with no undo.
 */
function WipeTestContentPanel() {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WipeTestContentResult | null>(null);

  const canSubmit = phrase === WIPE_CONFIRM_PHRASE && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (
      !window.confirm(
        "This permanently overwrites the posted photos of every creator account that isn't one of the 5 official demo creators. Continue?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/system/wipe-test-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: phrase }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Wipe failed.");
      setResult(body);
      setPhrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wipe failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Wipe Test Content</h2>
      <p style={mutedSmallStyle}>
        Overwrites the posted image for every photo post belonging to a creator account that isn&apos;t one of the 5
        official demo creators (Thandeka, Amara, Zoe, Lerato, Naledi) with the baddies wordmark. Accounts, captions,
        and every other field are left untouched — only the image itself changes, and there&apos;s no undo. Video
        and audio posts are never affected.
      </p>

      <div style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.75rem", marginTop: "1rem" }}>
        <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          Type <code>{WIPE_CONFIRM_PHRASE}</code> to enable the button
        </label>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={WIPE_CONFIRM_PHRASE}
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
          {busy ? "Wiping..." : "Replace test content images"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}

      {result && (
        <div style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.4rem", marginTop: "1rem" }}>
          <span style={{ fontWeight: 600, color: "var(--success)" }}>Done.</span>
          <span style={mutedSmallStyle}>
            Replaced {result.mediaAssetsReplaced} image file(s) across {result.contentAffected} post(s) from{" "}
            {result.creatorsAffected} creator account(s).
          </span>
        </div>
      )}
    </section>
  );
}

interface DeleteFanAccountsResult {
  deleted: { usersRemoved: number };
  preservedEmail: string;
}

const DELETE_FANS_CONFIRM_PHRASE = "DELETE FAN ACCOUNTS";
const PRESERVED_FAN_EMAIL_DISPLAY = "fan-test@example.test";

/**
 * Per direct request ("delete fan accounts except for fan test") —
 * irreversibly deletes every FAN-role account except the one preserved
 * fixture email (see POST /api/admin/system/delete-fan-accounts's own
 * doc comment for the exact FK-safety model: every fan-side relation
 * cascades except LedgerEntry/Payout, which are cleared explicitly
 * first). Same "type the exact phrase" pattern as Reset Roster/Wipe
 * Test Content.
 */
function DeleteFanAccountsPanel() {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteFanAccountsResult | null>(null);

  const canSubmit = phrase === DELETE_FANS_CONFIRM_PHRASE && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (
      !window.confirm(
        `This permanently deletes every fan account except ${PRESERVED_FAN_EMAIL_DISPLAY}. Continue?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/system/delete-fan-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: phrase }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Delete failed.");
      setResult(body);
      setPhrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Delete Fan Accounts</h2>
      <p style={mutedSmallStyle}>
        Permanently deletes every account with the Fan role except <code>{PRESERVED_FAN_EMAIL_DISPLAY}</code> — that
        one is always kept. Everything belonging to a deleted fan (subscriptions, purchases, tips, likes, follows,
        messages sent, sessions) goes with it. This cannot be undone.
      </p>

      <div style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.75rem", marginTop: "1rem" }}>
        <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          Type <code>{DELETE_FANS_CONFIRM_PHRASE}</code> to enable the button
        </label>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={DELETE_FANS_CONFIRM_PHRASE}
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
          {busy ? "Deleting..." : "Delete fan accounts"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}

      {result && (
        <div style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.4rem", marginTop: "1rem" }}>
          <span style={{ fontWeight: 600, color: "var(--success)" }}>Done.</span>
          <span style={mutedSmallStyle}>
            Deleted {result.deleted.usersRemoved} fan account(s). Kept {result.preservedEmail}.
          </span>
        </div>
      )}
    </section>
  );
}

interface AbuseFlagRow {
  id: string;
  type: string;
  status: string;
  reason: string;
  autoDetected: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

/**
 * Fraud & abuse review — narrow, rule-based flags only (e.g. a payment
 * webhook whose amount/currency didn't match its order). Records a
 * finding (DISMISSED/CONFIRMED) but never takes corrective action
 * itself — see POST /api/admin/abuse-flags/[id]/resolve's own comment.
 */
function AbuseFlagsSection() {
  const [flags, setFlags] = useState<AbuseFlagRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "?status=";
    fetch(`/api/admin/abuse-flags${qs}`)
      .then((r) => (r.ok ? r.json() : { flags: [] }))
      .then((body) => setFlags(body.flags ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [statusFilter]);

  async function resolve(id: string, status: "DISMISSED" | "CONFIRMED") {
    const resolutionNotes = window.prompt(
      status === "CONFIRMED"
        ? "What did you confirm about this flag? (goes on the record)"
        : "Why are you dismissing this flag?"
    );
    if (!resolutionNotes) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/abuse-flags/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolutionNotes }),
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
      <h3 style={statGroupHeadingStyle}>Fraud &amp; abuse review</h3>
      <select
        style={{ ...statusSelectStyle, marginBottom: "1rem" }}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="OPEN">Open</option>
        <option value="REVIEWING">Reviewing</option>
        <option value="DISMISSED">Dismissed</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="">All</option>
      </select>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : flags.length === 0 ? (
        <p style={{ color: "var(--success)", fontWeight: 600 }}>No flags match — you&apos;re all caught up.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {flags.map((f) => (
            <div key={f.id} style={{ ...rowCardStyle, flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ fontSize: "0.88rem" }}>{humanizeKey(f.type)}</div>
                  <div style={mutedSmallStyle}>
                    {f.reason}
                    {" · "}
                    {new Date(f.createdAt).toLocaleString()}
                  </div>
                  {f.resolutionNotes && (
                    <div style={mutedSmallStyle}>
                      resolved: {f.resolutionNotes}
                      {f.reviewedAt && ` (${new Date(f.reviewedAt).toLocaleDateString()})`}
                    </div>
                  )}
                </div>
                <span style={filterChipStyle}>{f.status}</span>
              </div>
              {(f.status === "OPEN" || f.status === "REVIEWING") && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => resolve(f.id, "CONFIRMED")} disabled={busyId === f.id} style={rejectButtonStyle}>
                    Confirm
                  </button>
                  <button onClick={() => resolve(f.id, "DISMISSED")} disabled={busyId === f.id} style={approveButtonStyle}>
                    Dismiss
                  </button>
                </div>
              )}
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
                {/* Self-declared at apply-time (baddies creators are
                    female only) — shown right alongside the identity/
                    age/liveness evidence above, the same glance where
                    an admin already cross-checks a real photo against
                    what an applicant claims. */}
                <div style={mutedSmallStyle}>Self-declared female: {app.confirmsFemale ? "Yes ✓" : "Not confirmed"}</div>
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
                <div style={rowInfoClickableStyle} onClick={() => setSelectedId(item.contentId)} role="button">
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
  const [mediaItems, setMediaItems] = useState<{ mimeType: string; signedUrl: string }[] | null>(null);
  const [mediaError, setMediaError] = useState(false);

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

  // Real preview, per direct request — ADMIN already has unconditional
  // access to /api/content/:id/media (canAccessContent's admin_override
  // branch), regardless of this item's status, so no new backend route
  // is needed. Fetched here (the single-item detail view) rather than
  // per-row in the list views above, which could be hundreds of rows —
  // same "don't pay for what isn't open" reasoning ContentThumbnail
  // (src/app/profile/page.tsx) already applies via its own
  // IntersectionObserver gate; a detail view has exactly one item, so a
  // plain mount-effect fetch is enough, no observer needed.
  useEffect(() => {
    let cancelled = false;
    setMediaItems(null);
    setMediaError(false);
    fetch(`/api/content/${contentId}/media`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (body?.media?.length > 0) setMediaItems(body.media);
        else setMediaError(true);
      })
      .catch(() => {
        if (!cancelled) setMediaError(true);
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
          <div style={contentPreviewWrapStyle}>
            {mediaItems ? (
              mediaItems.map((m, i) =>
                m.mimeType.startsWith("video/") ? (
                  <video key={i} src={m.signedUrl} controls style={contentPreviewMediaStyle} />
                ) : m.mimeType.startsWith("audio/") ? (
                  <div key={i} style={contentPreviewAudioStyle}>♪ Audio</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={m.signedUrl} alt="" style={contentPreviewMediaStyle} />
                )
              )
            ) : mediaError ? (
              <div style={contentPreviewFallbackStyle}>Preview unavailable.</div>
            ) : (
              <div style={contentPreviewFallbackStyle}>Loading preview...</div>
            )}
          </div>

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

const contentPreviewWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  marginBottom: "1.25rem",
};

const contentPreviewMediaStyle: React.CSSProperties = {
  maxWidth: "320px",
  maxHeight: "320px",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  objectFit: "contain",
  background: "var(--surface-raised)",
};

const contentPreviewAudioStyle: React.CSSProperties = {
  ...contentPreviewMediaStyle,
  width: "320px",
  height: "80px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.4rem",
  color: "var(--accent)",
};

const contentPreviewFallbackStyle: React.CSSProperties = {
  width: "320px",
  height: "80px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "10px",
  border: "1px dashed var(--border)",
  color: "var(--text-muted)",
  fontSize: "0.85rem",
};

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

// Hidden by default (desktop); .admin-nav-toggle in globals.css turns
// this on only below the same 860px breakpoint the sidebar itself
// stacks at, matching the nav-hamburger/bottom-tab-bar convention of
// "always mounted, CSS decides visibility" used elsewhere in this app.
const adminNavToggleStyle: React.CSSProperties = {
  display: "none",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "0.9rem",
  fontWeight: 600,
  padding: "0.65rem 0.9rem",
  marginBottom: "0.75rem",
  cursor: "pointer",
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

// Base shape only — color and borderBottom are applied per-group at the
// NavGroups call site (group.color), not hardcoded here. Previously
// every group's label sat in flat var(--text-muted), so the only real
// differentiation between "People" and "Business" was the tiny 6px dot;
// tinting the label itself + a low-alpha underline (same `33` alpha
// convention the active-row background already uses at `1a`) makes each
// category read distinctly without a background wash, which would
// compete with the active-item's own tint using the same hue.
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
  fontWeight: 700,
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

// The clickable text column inside a rowCardStyle row (Members/Creators,
// Trust & Safety cases, Content queue) — real, confirmed overflow bug:
// `flex: 1` alone defaults to `min-width: auto`, so next to the fixed-
// width action buttons (flexShrink: 0) this column refused to shrink
// below its own text's intrinsic width (a long email, a long caption)
// and pushed the whole row — and with it the page — wider than a phone
// viewport. `minWidth: 0` is what actually lets a flex child shrink
// smaller than its content and let that content wrap/truncate instead.
// textAlign: "left" is required here, not decorative — this app's own
// global `main { text-align: center; }` rule (globals.css) otherwise
// centers every line of a member/creator/content row's metadata text,
// which reads badly for a data row (per direct request: "left align
// this content"). Shared by every rowCardStyle consumer (Members/
// Creators, Trust & Safety, Content queue) — none of those want
// centered metadata either, so the fix belongs here once, not per tab.
const rowInfoClickableStyle: React.CSSProperties = { cursor: "pointer", flex: 1, minWidth: 0, textAlign: "left" };

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
