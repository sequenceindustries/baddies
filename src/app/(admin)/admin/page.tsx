"use client";

import { useEffect, useState } from "react";
import { useSession, displayHeadingStyle } from "@/components/ui";

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

export default function AdminDashboardPage() {
  const { user, loading } = useSession();

  if (loading) return <main style={mainStyle} />;

  if (!user) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
      </main>
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
      <h1 style={displayHeadingStyle}>Admin Dashboard</h1>
      <FoundingApplicationsQueue />
      <CreatorQueue />
      <ContentQueue />
      <PayoutQueue />
      <UserActionsPanel />
      <AuditLogPanel />
    </main>
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
  "LIVE",
  "REJECTED",
] as const;

/**
 * Founding Baddies campaign applications (§ Founding Baddies Sprint,
 * Phase 5) — top of the admin page since recruiting the first cohort is
 * this sprint's whole point. One generic status dropdown per row
 * (FOUNDING_STATUSES) rather than approve/reject buttons — there are 8
 * real pipeline stages here, not a binary decision.
 */
function FoundingApplicationsQueue() {
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
      <h2 style={sectionHeadingStyle}>Founding Baddies applications</h2>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : applications.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No applications yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {applications.map((app) => {
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
                    <div style={{ fontSize: "0.85rem", marginTop: "0.6rem" }}>
                      <strong>Why Baddies:</strong> {app.whyJoinBaddies}
                    </div>
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

interface LookedUpUser {
  userId: string;
  email: string;
  role: string;
  displayName: string | null;
  isActive: boolean;
  suspendedAt: string | null;
  creatorProfileStatus: string | null;
}

function UserActionsPanel() {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<LookedUpUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    setFound(null);
    const res = await fetch(`/api/admin/users/lookup?email=${encodeURIComponent(email.trim())}`);
    setSearching(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "User not found.");
      return;
    }
    setFound(await res.json());
  }

  async function act(action: "suspend" | "ban") {
    if (!found) return;
    if (!window.confirm(`${action === "ban" ? "Ban" : "Suspend"} ${found.email}?`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${found.userId}/${action}`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setFound({ ...found, isActive: false });
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `${action} failed.`);
    }
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2 style={sectionHeadingStyle}>User actions</h2>
      <form onSubmit={lookup} style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", maxWidth: "420px" }}>
        <input
          style={{
            flex: 1,
            padding: "0.5rem 0.7rem",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            fontSize: "0.85rem",
          }}
          placeholder="Look up by email..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
        />
        <button type="submit" disabled={searching} style={approveButtonStyle}>
          {searching ? "..." : "Look up"}
        </button>
      </form>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

      {found && (
        <div style={rowCardStyle}>
          <div>
            <div style={{ fontWeight: 600 }}>
              {found.displayName ?? found.email} · {found.role}
            </div>
            <div style={mutedSmallStyle}>
              {found.email} · {found.isActive ? "active" : "inactive"}
              {found.creatorProfileStatus ? ` · creator: ${found.creatorProfileStatus}` : ""}
            </div>
          </div>
          {found.role !== "ADMIN" && found.isActive && (
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
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/audit-log")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((body) => {
        if (!cancelled) setEntries(body.entries ?? []);
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
      <h2 style={sectionHeadingStyle}>Audit log</h2>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No activity yet.</p>
      ) : (
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
        <p style={{ color: "var(--text-muted)" }}>Nothing pending.</p>
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

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "900px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1rem",
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
