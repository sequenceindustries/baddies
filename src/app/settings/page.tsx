"use client";

import { useEffect, useState } from "react";
import { useSession, displayHeadingStyle, cardStyle, Field, inputStyle, primaryButtonStyle, errorBannerStyle, PasswordInput } from "@/components/ui";
import { SegmentedTabs } from "@/components/segmented-tabs";

type SettingsTab = "account" | "password" | "sessions";

const SETTINGS_TABS: { value: SettingsTab; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "password", label: "Password" },
  { value: "sessions", label: "Sessions" },
];

/**
 * Real account-level settings — password, sessions, email verification.
 * Split from /profile (display name/bio/avatar/location — what shows on
 * your profile) per explicit product decision: this page used to be one
 * thing called "Settings" holding both; now each has its own page and
 * its own real functions, not just a renamed heading. That split stays
 * exactly as it was — tabs (social-feed follow-up) go *within* this
 * page, not back across the two. All three tabs are always shown
 * (unlike /profile's conditional second tab) since every signed-in
 * account has a password and sessions to manage.
 */
export default function SettingsPage() {
  const { user, loading, refresh } = useSession();
  const [tab, setTab] = useState<SettingsTab>("account");

  if (loading) return <main style={mainStyle} />;
  if (!user) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={{ ...displayHeadingStyle, textAlign: "center" }}>Settings</h1>

      <SegmentedTabs tabs={SETTINGS_TABS} active={tab} onChange={setTab} />

      {tab === "account" && (
        <>
          <AccountOverviewPanel role={user.role} createdAt={user.createdAt} onSignOut={refresh} />
          <AccountEmailPanel email={user.email} emailVerified={user.emailVerified} isCreator={Boolean(user.creatorProfile)} />
        </>
      )}
      {tab === "password" && <ChangePasswordPanel />}
      {tab === "sessions" && <SessionsPanel />}
    </main>
  );
}

const ROLE_LABEL: Record<"FAN" | "CREATOR" | "ADMIN" | "PARTNER", string> = {
  FAN: "Fan",
  CREATOR: "Creator",
  ADMIN: "Admin",
  PARTNER: "Founding Partner",
};

/**
 * A quick account summary + sign-out, right at the top — this page used
 * to jump straight into Email with nothing establishing "this is your
 * account" first, and Sign out otherwise only ever lived in the nav's
 * account menu, easy to miss on a page whose whole job is account
 * management.
 */
function AccountOverviewPanel({
  role,
  createdAt,
  onSignOut,
}: {
  role: "FAN" | "CREATOR" | "ADMIN" | "PARTNER";
  createdAt: string;
  onSignOut: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    onSignOut();
    window.location.href = "/";
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Account</h2>
      <p style={{ margin: 0, fontSize: "0.92rem" }}>{ROLE_LABEL[role]} account</p>
      <p style={{ ...mutedSmallStyle, marginTop: "0.4rem" }}>
        Member since {new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long" })}
      </p>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        style={{ ...secondaryButtonStyle, marginTop: "1rem" }}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function AccountEmailPanel({ email, emailVerified, isCreator }: { email: string; emailVerified: boolean; isCreator: boolean }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  // Only fetched for creators — a plain fan's phone lives nowhere in
  // this app (only Founding Baddies applicants ever supply one, on
  // FoundingApplication), so this stays null and the row just doesn't
  // render rather than showing "Not on file" to everyone.
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreator) return;
    let cancelled = false;
    fetch("/api/creator/verification/identity-details")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body?.phone) setPhone(body.phone);
      });
    return () => {
      cancelled = true;
    };
  }, [isCreator]);

  async function resend() {
    setStatus("sending");
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
    setStatus(res.ok ? "sent" : "error");
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
      <h2 style={sectionHeadingStyle}>Email</h2>
      <p style={{ margin: 0, fontSize: "0.92rem" }}>{email}</p>
      <p style={{ ...mutedSmallStyle, marginTop: "0.4rem" }}>
        {emailVerified ? "✓ Verified" : "Not verified yet."}
      </p>
      {!emailVerified && (
        <div
          style={{
            marginTop: "0.6rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <button onClick={resend} disabled={status === "sending" || status === "sent"} style={secondaryButtonStyle}>
            {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : status === "error" ? "Try again" : "Resend verification email"}
          </button>
          {status === "sent" && <span style={mutedSmallStyle}>Check your inbox.</span>}
        </div>
      )}
      {phone && (
        <>
          <h2 style={{ ...sectionHeadingStyle, marginTop: "1.25rem" }}>Phone</h2>
          <p style={{ margin: 0, fontSize: "0.92rem" }}>{phone}</p>
          <p style={{ ...mutedSmallStyle, marginTop: "0.4rem" }}>From your creator application. Can&apos;t be changed here.</p>
        </>
      )}
    </div>
  );
}

function ChangePasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Couldn't change your password.");
      return;
    }
    const body = await res.json();
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setResult(
      body.otherSessionsSignedOut > 0
        ? `✓ Password changed — signed out ${body.otherSessionsSignedOut} other session(s) for security.`
        : "✓ Password changed."
    );
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Change password</h2>
      <form onSubmit={handleSubmit}>
        {error && <div style={errorBannerStyle}>{error}</div>}
        <Field label="Current password">
          <PasswordInput
            style={inputStyle}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="New password" hint="At least 10 characters.">
          <PasswordInput
            style={inputStyle}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={10}
            required
          />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput
            style={inputStyle}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={10}
            required
          />
        </Field>
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Saving..." : "Change password"}
        </button>
        {result && <p style={{ ...mutedSmallStyle, marginTop: "0.75rem" }}>{result}</p>}
      </form>
    </div>
  );
}

function SessionsPanel() {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [revokedCount, setRevokedCount] = useState<number | null>(null);

  async function revokeOthers() {
    if (!window.confirm("Sign out of every other device/browser? This one stays signed in.")) return;
    setStatus("working");
    const res = await fetch("/api/auth/sessions/revoke-others", { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    const body = await res.json();
    setRevokedCount(body.revokedCount);
    setStatus("done");
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Sessions</h2>
      <p style={{ ...mutedSmallStyle, marginTop: 0 }}>
        Signed in on a shared or lost device? Sign out everywhere else — this browser stays signed in.
      </p>
      <button onClick={revokeOthers} disabled={status === "working"} style={secondaryButtonStyle}>
        {status === "working" ? "Signing out…" : "Sign out of all other devices"}
      </button>
      {status === "done" && (
        <p style={{ ...mutedSmallStyle, marginTop: "0.6rem" }}>
          {revokedCount && revokedCount > 0 ? `✓ Signed out ${revokedCount} other session(s).` : "No other active sessions found."}
        </p>
      )}
      {status === "error" && <p style={{ ...mutedSmallStyle, color: "var(--danger)", marginTop: "0.6rem" }}>Something went wrong. Try again.</p>}
    </div>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "620px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1.1rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.82rem", color: "var(--text-muted)" };

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  borderRadius: "var(--radius)",
  padding: "0.5rem 1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};
