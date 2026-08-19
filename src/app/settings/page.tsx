"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useSession,
  displayHeadingStyle,
  cardStyle,
  Field,
  inputStyle,
  primaryButtonStyle,
  errorBannerStyle,
  LocationField,
} from "@/components/ui";

export default function SettingsPage() {
  const { user, loading } = useSession();

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
      <h1 style={displayHeadingStyle}>Settings</h1>
      <AccountTypePanel role={user.role} creatorProfile={user.creatorProfile} />
      <ProfileSettings />
    </main>
  );
}

/**
 * Spells out, in plain words, exactly what kind of account this is —
 * the same distinction the nav badge makes at a glance, but with room
 * here to explain what it means and what to do about it.
 */
function AccountTypePanel({
  role,
  creatorProfile,
}: {
  role: "FAN" | "CREATOR" | "ADMIN";
  creatorProfile: { id: string; status: string } | null;
}) {
  let heading = "Fan account";
  let body = "You can browse, subscribe, and tip creators.";
  if (role === "ADMIN") {
    heading = "Admin account";
    body = "You have platform administration access.";
  } else if (creatorProfile) {
    heading = "Creator account";
    body =
      creatorProfile.status === "VERIFIED"
        ? "You're verified — your uploads publish immediately, no approval wait."
        : `Application in progress (status: ${creatorProfile.status}).`;
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>{heading}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>{body}</p>
      {!creatorProfile && role !== "ADMIN" && (
        <Link
          href="/apply"
          style={{
            display: "inline-block",
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            color: "var(--accent-gold)",
            fontWeight: 600,
          }}
        >
          Become a creator →
        </Link>
      )}
      {creatorProfile && (
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          Manage pricing, privacy, and content from your Dashboard →
        </Link>
      )}
    </div>
  );
}

interface ProfileData {
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  country: string | null;
  city: string | null;
}

function ProfileSettings() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setData(body);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: data.displayName,
        bio: data.bio || null,
        avatarUrl: data.avatarUrl || null,
        country: data.country || undefined,
        city: data.city || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed.");
      return;
    }
    setSaved(true);
  }

  if (!data) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Profile</h2>
      <form onSubmit={handleSubmit}>
        {error && <div style={errorBannerStyle}>{error}</div>}
        <Field label="Display name">
          <input
            style={inputStyle}
            value={data.displayName ?? ""}
            onChange={(e) => setData({ ...data, displayName: e.target.value })}
            minLength={2}
            maxLength={50}
          />
        </Field>
        <Field label="Bio" hint="Optional.">
          <textarea
            style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
            value={data.bio ?? ""}
            onChange={(e) => setData({ ...data, bio: e.target.value })}
            maxLength={2000}
          />
        </Field>
        <AvatarField avatarUrl={data.avatarUrl} onChange={(avatarUrl) => setData({ ...data, avatarUrl })} />
        <LocationField
          country={data.country ?? ""}
          city={data.city ?? ""}
          autoDetect={false}
          onChange={(v) => setData({ ...data, country: v.country, city: v.city })}
        />
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB — avatarUrl is stored as a plain data: URI string on Profile, so this keeps the row reasonable

/**
 * A real file picker instead of a raw "paste a URL" text box — nobody
 * has a hosted image URL sitting around. Reads the chosen file straight
 * to a data: URI client-side and hands that to the parent form; Profile.
 * avatarUrl is already just a plain string field (unlike Content, which
 * goes through the signed-URL storage provider), so no upload endpoint
 * is needed — it saves the same way pasting a URL always did.
 */
function AvatarField({ avatarUrl, onChange }: { avatarUrl: string | null; onChange: (url: string | null) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setError(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image is too large — please pick one under 2MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    onChange(dataUrl);
  }

  return (
    <Field label="Profile picture" hint="JPG or PNG, up to 2MB." error={error ?? undefined}>
      <div style={avatarFieldRowStyle}>
        <div style={avatarPreviewStyle}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "?"
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={uploadButtonStyle}>
            Upload photo
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {avatarUrl && (
            <button type="button" onClick={() => onChange(null)} style={removeAvatarButtonStyle}>
              Remove
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

const avatarFieldRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  marginTop: "0.4rem",
};

const avatarPreviewStyle: React.CSSProperties = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "2px solid var(--accent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--accent)",
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  fontSize: "1.3rem",
  overflow: "hidden",
  flexShrink: 0,
};

const uploadButtonStyle: React.CSSProperties = {
  display: "inline-block",
  background: "var(--accent)",
  color: "var(--bg)",
  borderRadius: "var(--radius)",
  padding: "0.55rem 1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  textAlign: "center",
};

const removeAvatarButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  borderRadius: "var(--radius)",
  padding: "0.45rem 1rem",
  fontSize: "0.82rem",
  cursor: "pointer",
};

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "620px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1.1rem",
};
