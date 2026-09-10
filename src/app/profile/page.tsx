"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useSession,
  displayHeadingStyle,
  cardStyle,
  Field,
  inputStyle,
  checkboxRowStyle,
  primaryButtonStyle,
  errorBannerStyle,
  LocationField,
  ImageUploadField,
} from "@/components/ui";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { VerificationFlow } from "@/components/verification-capture";
import { ACCESS_LABEL } from "@/components/cards";
import { EXCLUSIVE_MIN_PRICE_USD } from "@/lib/creator/pricing";

type ProfileTab = "profile" | "overview" | "content" | "settings" | "application";

type CreatorStatus =
  | "PENDING"
  | "VERIFICATION_REQUIRED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "SUSPENDED"
  | "REJECTED"
  | "BANNED";

// FREE/VIP/VVIP — see prisma/schema.prisma's ContentAccessLevel comment.
type AccessLevel = "FREE" | "VIP" | "VVIP";

interface OwnContentItem {
  contentId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO";
  accessLevel: AccessLevel;
  priceUsd: string | number | null;
  caption: string | null;
  status: string;
  moderationStatus: string;
  publishedAt: string | null;
  createdAt: string;
  likeCount: number;
}

/**
 * Public identity — display name, bio, avatar, location, and what kind
 * of account this is — PLUS, for a creator, everything that used to
 * live on the separate /creator-dashboard route (status, verification,
 * onboarding checklist, stats, content upload/management, and creator-
 * specific pricing/privacy settings), folded in here as additional
 * tabs per direct request ("remove dashboard from menu and merge with
 * profile"). Account-level settings (password, sessions, email
 * verification — see /settings) stay a genuinely separate page, exactly
 * as they were before this merge — that split was a deliberate earlier
 * product decision this request didn't touch, only the dashboard/
 * profile one was.
 *
 * Tab set depends on account type: a fan sees just "Profile" (no bar at
 * all — nothing to switch between). A creator additionally gets
 * "Overview"/"Content"/"Settings" (the old dashboard tabs, only while
 * their account is active — not REJECTED/BANNED, matching that page's
 * own original gating) and "Application details" (their own read-only
 * submitted identity/verification info, shown regardless of active
 * status). StatusPanel and the pending-verification notice are tab-
 * agnostic — they showed above the tab body on every dashboard tab
 * before this merge, and still do here.
 */
export default function ProfilePage() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState<ProfileTab>("profile");

  if (loading) return <main style={mainStyle} />;
  if (!user) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
      </main>
    );
  }

  const creatorStatus = user.creatorProfile?.status as CreatorStatus | undefined;
  const creatorActive = Boolean(creatorStatus) && creatorStatus !== "REJECTED" && creatorStatus !== "BANNED";

  const tabs: { value: ProfileTab; label: string }[] = [{ value: "profile", label: "Profile" }];
  if (creatorActive) {
    tabs.push({ value: "overview", label: "Overview" }, { value: "content", label: "Content" }, { value: "settings", label: "Settings" });
  }
  if (user.creatorProfile) {
    tabs.push({ value: "application", label: "Application details" });
  }
  // A tab that only appears while the account is active shouldn't leave
  // the viewer stranded on it if their status changes underneath them
  // (e.g. re-checking this page after a suspension) — falls back to
  // "profile" rather than rendering a body for a tab that's disappeared.
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "profile";

  return (
    <main style={mainStyle}>
      <h1 style={{ ...displayHeadingStyle, textAlign: "center" }}>Profile</h1>

      {user.creatorProfile && creatorStatus && <StatusPanel status={creatorStatus} />}

      {tabs.length > 1 && <SegmentedTabs tabs={tabs} active={activeTab} onChange={setTab} />}

      {/* Repeats regardless of which tab is open — StatusPanel's own
          message above is easy to lose sight of once you've scrolled
          into Content or Overview, and Content in particular still
          shows the full upload form to a not-yet-verified creator (the
          real gate is server-side, on submit) with nothing nearby
          saying they can't actually publish yet. */}
      {creatorStatus && (creatorStatus === "PENDING" || creatorStatus === "VERIFICATION_REQUIRED" || creatorStatus === "UNDER_REVIEW") && (
        <PendingVerificationNotice status={creatorStatus} />
      )}

      {activeTab === "profile" && (
        <>
          <AccountTypePanel
            role={user.role}
            creatorProfile={user.creatorProfile}
            foundingPartner={user.foundingPartner}
            createdAt={user.createdAt}
          />
          <ProfileSettings />
        </>
      )}
      {activeTab === "overview" && creatorActive && (
        <div style={overviewGridStyle}>
          <OnboardingChecklist />
          <StatsPanel />
        </div>
      )}
      {activeTab === "content" && creatorActive && <ContentPanel />}
      {activeTab === "settings" && creatorActive && <CreatorSettingsPanel />}
      {activeTab === "application" && user.creatorProfile && <ApplicationDetailsPanel />}
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
  foundingPartner,
  createdAt,
}: {
  role: "FAN" | "CREATOR" | "ADMIN" | "PARTNER";
  creatorProfile: { id: string; status: string } | null;
  foundingPartner: { id: string; status: string } | null;
  createdAt: string;
}) {
  // foundingPartner and creatorProfile are independent — an account can
  // hold both (a Founding Partner who's also applied as a creator; see
  // /api/partner/dashboard's comment on why role alone can't tell "is
  // this a partner" once that happens), so this panel describes whatever
  // combination is actually true rather than picking just one.
  let heading = "Fan account";
  let body = "You can browse and subscribe to creators.";
  if (role === "ADMIN") {
    heading = "Admin account";
    body = "You have platform administration access.";
  } else if (foundingPartner && creatorProfile) {
    heading = "Founding Partner + Creator account";
    body =
      creatorProfile.status === "VERIFIED"
        ? "You have your private Founding Partner dashboard, and you're a verified creator — your uploads publish immediately."
        : `You have your private Founding Partner dashboard. Your creator application is in progress (status: ${creatorProfile.status}).`;
  } else if (foundingPartner) {
    heading = "Founding Partner account";
    body = "You have access to your private Founding Partner dashboard.";
  } else if (creatorProfile) {
    heading = "Creator account";
    body =
      creatorProfile.status === "VERIFIED"
        ? "You're verified — your uploads publish immediately, no approval wait."
        : `Application in progress (status: ${creatorProfile.status}).`;
  }

  const linkStyle: React.CSSProperties = {
    display: "inline-block",
    marginTop: "0.6rem",
    fontSize: "0.85rem",
    color: "var(--accent)",
    fontWeight: 600,
  };

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>{heading}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>{body}</p>
      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>
        Member since{" "}
        {new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long" })}
      </p>
      {!creatorProfile && role !== "ADMIN" && (
        <Link href="/apply" style={linkStyle}>
          Become a creator →
        </Link>
      )}
      {/* No "go manage your dashboard" link here anymore — Overview/
          Content/Settings are tabs on this same page now (see the
          SegmentedTabs above), not a separate route to point at. */}
      {foundingPartner && (
        <Link href="/partner-dashboard" style={{ ...linkStyle, display: "block" }}>
          Go to your Partner dashboard →
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
        <ImageUploadField
          label="Profile picture"
          value={data.avatarUrl}
          onChange={(avatarUrl) => setData({ ...data, avatarUrl })}
        />
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

interface ApplicationDetails {
  legalName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  idNumberMasked: string | null;
}

/**
 * What this creator filled in when they applied — legal name and (for
 * Founding Baddies applicants) phone, plus whatever real verification
 * has been submitted (date of birth, nationality, ID number). All
 * read-only: legal name/DOB/nationality/ID number only ever change
 * through a real re-verification, never a form field here, per explicit
 * product decision. Phone has no edit path either (nowhere else in this
 * app collects/updates a phone number today) — shown for visibility,
 * not because it's editable.
 */
function ApplicationDetailsPanel() {
  const [data, setData] = useState<ApplicationDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/verification/identity-details")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setData(body);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const rows: { label: string; value: string }[] = [
    { label: "Legal name", value: data.legalName ?? "Not on file" },
    { label: "Phone", value: data.phone ?? "Not on file" },
    { label: "Date of birth", value: data.dateOfBirth ? new Date(data.dateOfBirth).toLocaleDateString() : "Not submitted yet" },
    { label: "Nationality", value: data.nationality ?? "Not submitted yet" },
    { label: "ID number", value: data.idNumberMasked ?? "Not submitted yet" },
  ];

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Application details</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: "0 0 1rem" }}>
        From your creator application and identity verification. Can&apos;t be changed here.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.88rem" }}>
            <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// AvatarField (the local file-picker previously here) was removed in
// favor of the shared ImageUploadField (components/ui.tsx) — same
// avatar-picking job, but with client-side downscaling built in (see
// its own comment) that this hand-rolled copy never had. One real,
// measured production avatar decoded to ~191KB, embedded raw as a data:
// URI in Profile.avatarUrl — the single biggest confirmed contributor to
// slow content loads, since that string got re-sent inline in every API
// response that included this creator's info (feed, discovery, stories)
// rather than being a real, cacheable, lazily-loaded image. See
// src/lib/media/persist-public-image.ts for the server-side half of
// this fix — the string this field produces is converted to a real,
// long-lived storage URL before it's ever saved.

/**
 * A short, persistent reminder that stays visible under the tab bar no
 * matter which tab is open — StatusPanel's own message up top is easy
 * to lose sight of once you've scrolled into Content or Overview, and
 * Content in particular still shows the full upload form to a
 * not-yet-verified creator (the real gate is server-side, on submit).
 */
function PendingVerificationNotice({
  status,
}: {
  status: "PENDING" | "VERIFICATION_REQUIRED" | "UNDER_REVIEW";
}) {
  const copy: Record<typeof status, string> = {
    PENDING: "Application pending — content and stats unlock once you're verified.",
    VERIFICATION_REQUIRED: "Verification pending — finish the steps above before you can publish.",
    UNDER_REVIEW: "Verification submitted — awaiting admin review before you can publish.",
  };
  return (
    <div style={pendingNoticeStyle}>
      <span aria-hidden="true">⏳</span> {copy[status]}
    </div>
  );
}

/**
 * Phase 4's onboarding checklist — reuses three endpoints the rest of
 * this page already calls (no new backend needed): /api/profile for
 * the picture/bio, /api/creator/settings for the featured image, and
 * /api/creator/content for whether each tier has at least one post.
 * Purely a progress nudge, not a gate — a creator can ignore it and
 * everything else here still works.
 */
function OnboardingChecklist() {
  const [items, setItems] = useState<{ label: string; done: boolean }[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/creator/settings").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/creator/content").then((r) => (r.ok ? r.json() : { items: [] })),
    ]).then(([profile, settings, content]) => {
      const tiers = new Set((content?.items ?? []).map((i: OwnContentItem) => i.accessLevel));
      setItems([
        { label: "Profile picture", done: Boolean(profile?.avatarUrl) },
        { label: "Featured image", done: Boolean(settings?.coverImageUrl) },
        { label: "Creator bio", done: Boolean(profile?.bio) },
        { label: "Teasers content", done: tiers.has("FREE") },
        { label: "VIP content", done: tiers.has("VIP") },
        { label: "Exclusive content", done: tiers.has("VVIP") },
      ]);
    });
  }, []);

  if (!items) return null;
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null; // fully set up — no need to keep nudging

  return (
    <div style={cardStyle}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0, marginBottom: "0.3rem" }}>Get discovered</h2>
      <p style={{ ...mutedSmallStyle, marginTop: 0, marginBottom: "1rem" }}>
        {doneCount} of {items.length} set up — finish these to look your best to fans and other Founding baddies.
      </p>
      <div style={checklistGridStyle}>
        {items.map((item) => (
          <span key={item.label} style={checklistPillStyle(item.done)}>
            {item.done ? "✓" : "○"} {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface CreatorStats {
  followerCount: number;
  subscriberCount: number;
  publishedCount: number;
  totalCount: number;
  totalLikes: number;
  referredByPartner: boolean;
}

/** Overview's at-a-glance numbers — see GET /api/creator/stats for what each figure means and why it's computed separately from the public creator-profile endpoint. */
function StatsPanel() {
  const [stats, setStats] = useState<CreatorStats | null>(null);

  useEffect(() => {
    fetch("/api/creator/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setStats(body);
      });
  }, []);

  if (!stats) return null;

  return (
    <div style={cardStyle}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Stats</h2>
      <div style={statsGridStyle}>
        <WalletStat label="Followers" value={stats.followerCount} format="int" />
        <WalletStat label="Subscribers" value={stats.subscriberCount} format="int" />
        <WalletStat label="Published posts" value={stats.publishedCount} format="int" />
        <WalletStat label="Total uploads" value={stats.totalCount} format="int" />
        <WalletStat label="Total likes" value={stats.totalLikes} format="int" />
      </div>
      {/* Founding Partner Programme v2, spec §11 — quiet and private
          only: no partner identity, no incentive language, no public
          badge. Baddies stays a creator subscription platform first. */}
      {stats.referredByPartner && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.85rem 0 0" }}>
          You joined Baddies through a Founding Partner referral.
        </p>
      )}
    </div>
  );
}

// Wallet has its own page (src/app/wallet/page.tsx), reached from the
// nav's account menu ("Wallet ($balance)") — not a card here.

function WalletStat({
  label,
  value,
  format = "usd",
}: {
  label: string;
  value: number;
  format?: "usd" | "int";
}) {
  return (
    <div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>
        {format === "usd" ? `$${value.toFixed(2)}` : value.toLocaleString()}
      </div>
      <div style={mutedSmallStyle}>{label}</div>
    </div>
  );
}

function StatusPanel({ status }: { status: CreatorStatus }) {
  const copy: Record<CreatorStatus, string> = {
    PENDING: "Application received.",
    VERIFICATION_REQUIRED: "Complete your identity, age, and liveness verification below.",
    UNDER_REVIEW: "Verification complete — awaiting admin approval.",
    VERIFIED: "You're a Verified baddie. You can publish monetised content.",
    SUSPENDED: "Your creator account is suspended.",
    REJECTED: "Your application was not approved.",
    BANNED: "Your creator account has been banned.",
  };

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <p style={{ margin: 0, fontSize: "0.95rem" }}>
        <strong>Status:</strong> {status}
      </p>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>{copy[status]}</p>

      {status === "VERIFICATION_REQUIRED" && <VerificationFlow />}
    </div>
  );
}

interface CreatorSettingsData {
  effectiveVvipPriceUsd: number;
  unlimitedOptedIn: boolean;
  subscriberCountVisible: boolean;
  locationVisible: boolean;
  handle: string | null;
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Pricing, VIP-pass opt-in, privacy toggles, and this creator's own @handle — a creator-specific "Settings" tab, distinct from the account-level /settings page (password/sessions/email). */
function CreatorSettingsPanel() {
  const [data, setData] = useState<CreatorSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kept as separate string fields rather than folded straight into
  // `data` — both need to be freely-typeable mid-keystroke (a number
  // input's value like "5.", or a handle the user hasn't finished
  // typing yet), and neither needs to round-trip through more than one
  // parse/normalize step on submit.
  const [priceInput, setPriceInput] = useState("");
  const [handleInput, setHandleInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) {
          setData(body);
          setPriceInput(body.effectiveVvipPriceUsd.toFixed(2));
          setHandleInput(body.handle ?? "");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const exclusivePriceUsd = Number(priceInput);
    if (!Number.isFinite(exclusivePriceUsd) || exclusivePriceUsd < EXCLUSIVE_MIN_PRICE_USD) {
      setError(`Exclusive price must be at least $${EXCLUSIVE_MIN_PRICE_USD.toFixed(2)}.`);
      return;
    }
    const normalizedHandle = handleInput.trim().toLowerCase();
    if (normalizedHandle && !HANDLE_PATTERN.test(normalizedHandle)) {
      setError("Handle must be 3-20 characters: lowercase letters, numbers, and underscores only.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/creator/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exclusivePriceUsd,
        unlimitedOptedIn: data.unlimitedOptedIn,
        subscriberCountVisible: data.subscriberCountVisible,
        locationVisible: data.locationVisible,
        handle: normalizedHandle || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed.");
      return;
    }
    const body: CreatorSettingsData = await res.json();
    setData(body);
    setPriceInput(body.effectiveVvipPriceUsd.toFixed(2));
    setHandleInput(body.handle ?? "");
    setSaved(true);
  }

  if (!data) return null;

  return (
    <div style={cardStyle}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Creator settings</h2>
      <form onSubmit={handleSubmit}>
        {error && <div style={errorBannerStyle}>{error}</div>}
        <Field label="Handle" hint="3-20 characters: lowercase letters, numbers, and underscores. Shown as @handle wherever your posts appear. Leave blank to have none.">
          <div style={priceInputRowStyle}>
            <span style={priceAffixStyle}>@</span>
            <input
              style={priceInputStyle}
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              maxLength={20}
              placeholder="yourhandle"
            />
          </div>
        </Field>
        <Field
          label="Exclusive subscription price (USD)"
          hint={`Set your own price for fans who subscribe directly to you — $${EXCLUSIVE_MIN_PRICE_USD.toFixed(2)}/mo minimum.`}
        >
          <div style={priceInputRowStyle}>
            <span style={priceAffixStyle}>$</span>
            <input
              style={priceInputStyle}
              type="number"
              min={EXCLUSIVE_MIN_PRICE_USD}
              step="0.01"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              required
            />
            <span style={priceAffixStyle}>/mo</span>
          </div>
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
          Show country and city publicly
        </label>
        <button type="submit" style={primaryButtonStyle} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save creator settings"}
        </button>
      </form>
    </div>
  );
}

/**
 * The image shown for this creator on discovery cards (Top Baddies,
 * Baddies Near You, etc.) — CreatorProfile.coverImageUrl under the
 * hood, same field /apply can optionally set at signup. Lives in
 * Content management (not Settings) because it's about what represents
 * this creator's content, not account configuration. Leaving it unset
 * falls back to the latest published Free post automatically (see
 * src/lib/discovery/creator-card.ts).
 */
function FeaturedImagePanel() {
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/creator/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body) setFeaturedImageUrl(body.coverImageUrl ?? null);
      });
  }, []);

  async function save(next: string | null) {
    setFeaturedImageUrl(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/creator/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImageUrl: next }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed.");
      return;
    }
    setSaved(true);
  }

  if (featuredImageUrl === undefined) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Featured image</h2>
      <p style={{ ...mutedSmallStyle, marginTop: "-0.6rem", marginBottom: "1.1rem" }}>
        What shows on The Baddest, baddies near you, and other discovery cards. Keep it
        non-explicit. Leave blank to use your latest Teasers post instead.
      </p>
      <ImageUploadField label="Featured image" value={featuredImageUrl} onChange={save} shape="rect" />
      {saving && <p style={{ ...mutedSmallStyle, marginBottom: 0 }}>Saving...</p>}
      {saved && !saving && <p style={{ ...mutedSmallStyle, marginBottom: 0 }}>✓ Saved</p>}
      {error && <div style={{ ...errorBannerStyle, marginBottom: 0 }}>{error}</div>}
    </div>
  );
}

/**
 * Content history and control: every item this creator has ever
 * uploaded (see GET /api/creator/content's own comment on why it's
 * unfiltered by status), each with a Delete action. Delete is a soft
 * delete (DELETE /api/creator/content/:id — see that route's comment)
 * so it stays in this history afterward, just labeled Removed with no
 * further action available on it.
 */
function ContentPanel() {
  const [items, setItems] = useState<OwnContentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function reload() {
    setLoadingItems(true);
    fetch("/api/creator/content")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((body) => setItems(body.items ?? []))
      .finally(() => setLoadingItems(false));
  }

  useEffect(reload, []);

  async function publish(contentId: string) {
    const res = await fetch(`/api/creator/content/${contentId}/publish`, { method: "POST" });
    if (res.ok) reload();
  }

  async function remove(contentId: string) {
    if (!window.confirm("Delete this post? It will no longer be visible to anyone.")) return;
    setDeletingId(contentId);
    const res = await fetch(`/api/creator/content/${contentId}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) reload();
  }

  return (
    <>
      <FeaturedImagePanel />
      <UploadForm onUploaded={reload} />

      <h2 style={sectionHeadingStyle}>Content history</h2>
      {loadingItems ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing uploaded yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((item) => {
            const removed = item.status === "REMOVED";
            return (
              <div key={item.contentId} style={rowCardStyle}>
                <div style={{ opacity: removed ? 0.55 : 1 }}>
                  <div style={{ fontSize: "0.9rem" }}>{item.caption || "(no caption)"}</div>
                  <div style={mutedSmallStyle}>
                    {item.mediaType} · {ACCESS_LABEL[item.accessLevel]} ·{" "}
                    {removed ? "removed" : item.publishedAt ? "live" : item.status.toLowerCase()} · ♥{" "}
                    {item.likeCount}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  {/* Uploads publish immediately (see the upload route) —
                      this only ever fires for older rows from before that
                      change. */}
                  {item.status === "APPROVED" && !item.publishedAt && (
                    <button onClick={() => publish(item.contentId)} style={publishButtonStyle}>
                      Publish
                    </button>
                  )}
                  {!removed && (
                    <button
                      onClick={() => remove(item.contentId)}
                      disabled={deletingId === item.contentId}
                      style={deleteButtonStyle}
                    >
                      {deletingId === item.contentId ? "..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB per file — matches the API route's own ceiling

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [caption, setCaption] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("FREE");
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live thumbnail/video previews — "here's what you're about to post"
  // feedback instead of a bare filename list, per direct request ("make
  // the content upload more social media like too"). Object URLs are
  // regenerated whenever `files` changes and every URL this effect
  // created is revoked on the way out (both the next run and unmount),
  // so adding/removing files repeatedly never leaks memory.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(fileList: FileList | File[] | null) {
    setError(null);
    const chosen = Array.from(fileList ?? []);
    const tooLarge = chosen.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooLarge.length > 0) {
      setError(`${tooLarge.length === 1 ? "One file exceeds" : `${tooLarge.length} files exceed`} the 100MB limit and won't be included: ${tooLarge.map((f) => f.name).join(", ")}`);
    }
    const ok = chosen.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  async function uploadOne(file: File): Promise<string | null> {
    const mediaType = file.type.startsWith("video/")
      ? "VIDEO"
      : file.type.startsWith("audio/")
        ? "AUDIO"
        : "IMAGE";
    const base64Data = await fileToBase64(file);
    const res = await fetch("/api/creator/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaType,
        mimeType: file.type,
        base64Data,
        accessLevel,
        caption: caption || undefined,
      }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : "Upload failed.";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);

    // Sequential, not parallel — this is one creator's own upload queue,
    // not a race; keeping it sequential also keeps "Uploading 2 of 5..."
    // an honest, literal count rather than an approximation.
    const failures: string[] = [];
    for (const [i, currentFile] of files.entries()) {
      setProgress({ done: i, total: files.length });
      const err = await uploadOne(currentFile);
      if (err) failures.push(`${currentFile.name}: ${err}`);
    }
    setProgress(null);
    setSubmitting(false);

    if (failures.length > 0) {
      setError(
        failures.length === files.length
          ? `Upload failed for all ${files.length} file(s).\n${failures.join("\n")}`
          : `${files.length - failures.length} of ${files.length} uploaded. ${failures.length} failed:\n${failures.join("\n")}`
      );
    }
    setCaption("");
    setFiles([]);
    onUploaded();
  }

  return (
    <div style={{ ...cardStyle, marginBottom: "2rem" }}>
      <h2 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Upload content</h2>
      <p style={{ ...mutedSmallStyle, marginTop: "-0.6rem", marginBottom: "1.1rem" }}>
        Goes live immediately — no admin approval, no waiting.
      </p>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ ...errorBannerStyle, whiteSpace: "pre-line" }}>{error}</div>}

        <Field label="Photos & videos" hint="Up to 100MB per file — drop several at once to post them all together.">
          {files.length === 0 ? (
            <div
              style={dragActive ? { ...dropzoneStyle, ...dropzoneActiveStyle } : dropzoneStyle}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              <UploadCloudIcon />
              <span style={dropzoneTextStyle}>Drag photos or videos here, or click to browse</span>
            </div>
          ) : (
            <div style={previewGridStyle}>
              {files.map((file, i) => (
                <div key={`${file.name}-${file.lastModified}-${i}`} style={previewTileStyle}>
                  {file.type.startsWith("video/") ? (
                    <video src={previews[i]} style={previewMediaStyle} muted playsInline />
                  ) : file.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previews[i]} alt="" style={previewMediaStyle} />
                  ) : (
                    <span style={previewAudioIconStyle}>♪</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    style={previewRemoveButtonStyle}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => fileInputRef.current?.click()} style={previewAddTileStyle} aria-label="Add more files">
                +
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            style={hiddenFileInputStyle}
          />
        </Field>

        <Field label="Caption" hint="Optional. Applied to every file in this batch.">
          <input style={inputStyle} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} />
        </Field>

        <Field
          label="Access level"
          hint="Teasers: anyone. VIP: unlocked by the platform-wide VIP pass. Exclusive: only your own subscribers."
        >
          <select
            style={inputStyle}
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
          >
            <option value="FREE">Teasers</option>
            <option value="VIP">VIP</option>
            <option value="VVIP">Exclusive</option>
          </select>
        </Field>

        <button type="submit" style={primaryButtonStyle} disabled={submitting}>
          {submitting && progress ? `Uploading ${progress.done + 1} of ${progress.total}...` : submitting ? "Uploading..." : "Upload"}
        </button>
      </form>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Widened from the original Profile-only 620px to match the old
// dashboard's 760px now that Overview/Content/Settings (2-column grids,
// an upload form) live here too — the simpler Profile/Application tabs
// just get a bit more side whitespace at this width, same as several
// other pages in this app already sit at.
const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "760px", margin: "0 auto" };

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.2rem",
  fontWeight: 500,
  margin: "0 0 1.1rem",
};

const mutedSmallStyle: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" };

const pendingNoticeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  textAlign: "center",
  background: "var(--surface)",
  color: "var(--accent)",
  borderRadius: "999px",
  padding: "0.6rem 1.2rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginBottom: "1.75rem",
  boxShadow: "var(--glow)",
};

// Side by side on wide screens (Get discovered left, Stats right),
// stacking to one column on narrow ones — same two-column pattern as
// the landing page's "how it works" sections.
const overviewGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "1.5rem",
  alignItems: "start",
};

// A real 2-column grid instead of flex-wrap — flex-wrap packed items
// left-to-right by whatever fit, so which item ended up "under" which
// was just an accident of label length (e.g. Creator bio only ever
// landed next to Featured image because both happened to be short). A
// grid gives every item a real, consistent column.
const checklistGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "0.6rem",
};

function checklistPillStyle(done: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: done ? "var(--success)" : "var(--text-muted)",
    border: `1px solid ${done ? "var(--success)" : "var(--border)"}`,
    borderRadius: "999px",
    padding: "0.3rem 0.75rem",
  };
}

// A real 2-column grid instead of flex-wrap — flex-wrap sized each stat
// to its own label width, so "Followers"/"Subscribers" didn't land in
// the same columns as "Published posts"/"Total uploads" underneath
// them. A grid keeps every row's columns aligned.
const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "1.5rem 2rem",
};

const priceInputRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  marginTop: "0.4rem",
};

const priceAffixStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.95rem",
  fontWeight: 600,
};

const priceInputStyle: React.CSSProperties = {
  ...inputStyle,
  marginTop: 0,
  width: "120px",
};

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

const publishButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const deleteButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  borderRadius: "var(--radius)",
  padding: "0.4rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

// Dropzone — replaces the old plain "Choose files" button + filename
// text with a real drag-and-drop target, per direct request ("make the
// content upload more social media like too"). Dashed border reads as
// "drop things here" without borrowing any other component's solid-
// border card language.
const dropzoneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.6rem",
  padding: "2.25rem 1.5rem",
  borderRadius: "16px",
  border: "1.5px dashed var(--border)",
  background: "var(--surface-raised)",
  color: "var(--text-muted)",
  cursor: "pointer",
  marginTop: "0.4rem",
  transition: "border-color 0.15s ease, background 0.15s ease",
};

const dropzoneActiveStyle: React.CSSProperties = {
  borderColor: "var(--accent)",
  background: "var(--accent-soft)",
};

const dropzoneTextStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  textAlign: "center",
};

// Instagram/TikTok-style "here's what you're about to post" thumbnail
// grid, once at least one file is chosen — replaces the dropzone in
// place rather than sitting below it.
const previewGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  marginTop: "0.4rem",
};

const previewTileStyle: React.CSSProperties = {
  position: "relative",
  width: "84px",
  height: "84px",
  borderRadius: "12px",
  overflow: "hidden",
  background: "var(--surface-raised)",
  flexShrink: 0,
};

const previewMediaStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const previewAudioIconStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.6rem",
  color: "var(--accent)",
};

const previewRemoveButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: "4px",
  right: "4px",
  width: "20px",
  height: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "none",
  background: "rgba(0, 0, 0, 0.65)",
  color: "#fff",
  fontSize: "0.9rem",
  lineHeight: 1,
  cursor: "pointer",
};

const previewAddTileStyle: React.CSSProperties = {
  width: "84px",
  height: "84px",
  borderRadius: "12px",
  border: "1.5px dashed var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: "1.5rem",
  cursor: "pointer",
  flexShrink: 0,
};

const hiddenFileInputStyle: React.CSSProperties = { display: "none" };

function UploadCloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 17.5h8.75a3.25 3.25 0 0 0 .5-6.46 4.5 4.5 0 0 0-8.66-1.59A3.75 3.75 0 0 0 7.5 17.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10.5v6.5M9.5 13l2.5-2.5 2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
