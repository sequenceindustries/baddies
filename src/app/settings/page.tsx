"use client";

import { useEffect, useState } from "react";
import {
  useSession,
  displayHeadingStyle,
  cardStyle,
  Field,
  inputStyle,
  checkboxRowStyle,
  primaryButtonStyle,
  errorBannerStyle,
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
      <ProfileSettings />
      {user.creatorProfile && <CreatorSettings />}
    </main>
  );
}

interface ProfileData {
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  country: string | null;
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
        country: data.country || null,
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
        <Field label="Avatar URL" hint="Optional — link to an image.">
          <input
            style={inputStyle}
            value={data.avatarUrl ?? ""}
            onChange={(e) => setData({ ...data, avatarUrl: e.target.value })}
            type="url"
            placeholder="https://..."
          />
        </Field>
        <Field label="Country" hint="Optional.">
          <input
            style={inputStyle}
            value={data.country ?? ""}
            onChange={(e) => setData({ ...data, country: e.target.value })}
            maxLength={100}
          />
        </Field>
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

interface CreatorSettingsData {
  vvipPriceOverride: number | null;
  effectiveVvipPriceUsd: number;
  unlimitedOptedIn: boolean;
  subscriberCountVisible: boolean;
  locationVisible: boolean;
}

function CreatorSettings() {
  const [data, setData] = useState<CreatorSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/settings")
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
    const res = await fetch("/api/creator/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vvipPriceOverride: data.vvipPriceOverride,
        unlimitedOptedIn: data.unlimitedOptedIn,
        subscriberCountVisible: data.subscriberCountVisible,
        locationVisible: data.locationVisible,
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
    <div style={cardStyle}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Creator settings</h2>
      <form onSubmit={handleSubmit}>
        {error && <div style={errorBannerStyle}>{error}</div>}
        <Field
          label="VVIP subscription price (USD)"
          hint={`Your own subscribers pay this monthly. Leave blank to use the platform default ($${data.effectiveVvipPriceUsd.toFixed(2)}).`}
        >
          <input
            style={inputStyle}
            type="number"
            min="0.01"
            step="0.01"
            value={data.vvipPriceOverride ?? ""}
            onChange={(e) =>
              setData({ ...data, vvipPriceOverride: e.target.value ? Number(e.target.value) : null })
            }
          />
        </Field>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.unlimitedOptedIn}
            onChange={(e) => setData({ ...data, unlimitedOptedIn: e.target.checked })}
          />
          Include my VIP-tier content in the platform-wide VIP Pass
        </label>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.subscriberCountVisible}
            onChange={(e) => setData({ ...data, subscriberCountVisible: e.target.checked })}
          />
          Show subscriber count publicly
        </label>
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.locationVisible}
            onChange={(e) => setData({ ...data, locationVisible: e.target.checked })}
          />
          Show country publicly
        </label>
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save creator settings"}
        </button>
      </form>
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
