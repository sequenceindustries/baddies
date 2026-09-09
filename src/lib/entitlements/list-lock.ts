import { db } from "@/lib/db/client";
import type { User } from "@prisma/client";
import { isTrialActive } from "./trial";

/**
 * Display-only mirror of canAccessContent's rules (src/lib/entitlements/
 * content.ts), built for the social-feed redesign's list/grid routes
 * (feed, discovery, profile grid) which need "is this locked?" for many
 * items per page without one DB round trip per item the way
 * canAccessContent itself does.
 *
 * This module is NEVER authoritative. canAccessContent stays the sole
 * function allowed to actually grant access to real media — it is not
 * modified by this file at all, and GET /api/content/:id/media keeps
 * calling it exclusively, exactly as before. If this module and
 * canAccessContent ever disagree, the worst case is a card visually
 * shows the wrong lock state; it can NEVER cause an actual access
 * bypass, since the media route independently re-derives access from
 * scratch regardless of what any list route displayed. See
 * tests/unit/list-lock.test.ts (pure branch coverage) and
 * tests/integration/list-lock-parity.test.ts (cross-checked against
 * canAccessContent itself against real rows) — re-run both if
 * canAccessContent's rules ever change, since nothing enforces these
 * two staying in sync automatically.
 */

export type LockKind = "VIP_PASS" | "VVIP_SUBSCRIBE" | null;

export interface LockState {
  locked: boolean;
  kind: LockKind;
}

/** The minimal fields a list route needs to have already selected per item. */
export interface LockableContentItem {
  creatorProfileId: string;
  accessLevel: "FREE" | "VIP" | "VVIP" | "PPV";
  status: string;
  publishedAt: Date | string | null;
  // Whether THIS item's own creator has opted their VIP-tier content
  // into the platform-wide VIP pass — mirrors checkVipPassAccess's own
  // per-creator gate. Cheap to select alongside the item itself; no
  // extra query.
  creatorUnlimitedOptedIn: boolean;
}

/**
 * The handful of viewer-level facts canAccessContent would otherwise
 * re-fetch per item. Built once per request (buildViewerLockContext
 * below), not once per item.
 */
export interface ViewerLockContext {
  userId: string | null;
  role: User["role"] | null;
  /** creatorProfileIds this viewer holds an ACTIVE, unexpired Subscription to. */
  subscribedCreatorProfileIds: Set<string>;
  /** creatorProfileIds this viewer's own account owns (mirrors canAccessContent's "own_content" branch). */
  ownedCreatorProfileIds: Set<string>;
  vipPassActive: boolean;
  trialActive: boolean;
}

/**
 * One request-scoped set of queries instead of N — the whole point of
 * this module. Returns the "signed out" context (everything locked
 * except live FREE) without touching the DB at all when there's no user.
 */
export async function buildViewerLockContext(
  user: Pick<User, "id" | "role"> | null
): Promise<ViewerLockContext> {
  if (!user) {
    return {
      userId: null,
      role: null,
      subscribedCreatorProfileIds: new Set(),
      ownedCreatorProfileIds: new Set(),
      vipPassActive: false,
      trialActive: false,
    };
  }

  const now = new Date();
  const [subs, owned, vipPass, trial] = await Promise.all([
    db.subscription.findMany({
      where: { fanId: user.id, status: "ACTIVE", currentPeriodEnd: { gte: now } },
      select: { creatorProfileId: true },
    }),
    // Rare for a plain fan (a FAN role never owns a CreatorProfile), but
    // real for a dual-role account browsing their own feed as
    // themselves — mirrors canAccessContent's own_content branch rather
    // than silently dropping it for the list case.
    db.creatorProfile.findMany({ where: { userId: user.id }, select: { id: true } }),
    db.unlimitedSubscription.findFirst({
      where: { fanId: user.id, status: "ACTIVE", currentPeriodEnd: { gte: now } },
      select: { id: true },
    }),
    db.fanTrial.findUnique({ where: { fanId: user.id }, select: { status: true, expiresAt: true } }),
  ]);

  return {
    userId: user.id,
    role: user.role,
    subscribedCreatorProfileIds: new Set(subs.map((s: (typeof subs)[number]) => s.creatorProfileId)),
    ownedCreatorProfileIds: new Set(owned.map((o: (typeof owned)[number]) => o.id)),
    vipPassActive: Boolean(vipPass),
    trialActive: isTrialActive(trial),
  };
}

/**
 * Pure, synchronous, no DB access — the actual rule mirror. Branch
 * order deliberately matches canAccessContent's own branch order so
 * the two are easy to diff against each other by eye.
 */
export function computeLockState(item: LockableContentItem, ctx: ViewerLockContext): LockState {
  const isLive = item.status === "APPROVED" && item.publishedAt != null;

  if (item.accessLevel === "FREE" && isLive) {
    return { locked: false, kind: null };
  }

  if (!ctx.userId) {
    return { locked: true, kind: lockKindFor(item.accessLevel) };
  }

  if (ctx.role === "ADMIN") {
    return { locked: false, kind: null };
  }

  if (ctx.ownedCreatorProfileIds.has(item.creatorProfileId)) {
    return { locked: false, kind: null };
  }

  if (!isLive) {
    return { locked: true, kind: lockKindFor(item.accessLevel) };
  }

  if (item.accessLevel === "VVIP" || item.accessLevel === "VIP") {
    if (ctx.subscribedCreatorProfileIds.has(item.creatorProfileId)) {
      return { locked: false, kind: null };
    }

    if (item.accessLevel === "VVIP") {
      // No fallback — VVIP is exclusive to this creator's own subscribers.
      return { locked: true, kind: "VVIP_SUBSCRIBE" };
    }

    // VIP also qualifies under the platform-wide VIP pass or an active
    // trial, but only if this specific creator opted in — same gate
    // checkVipPassAccess/checkTrialAccess each apply individually.
    if (item.creatorUnlimitedOptedIn && (ctx.vipPassActive || ctx.trialActive)) {
      return { locked: false, kind: null };
    }

    return { locked: true, kind: "VIP_PASS" };
  }

  // PPV — dead code path (nothing can create PPV content anymore, see
  // canAccessContent's own comment); no unlock CTA makes sense for it.
  return { locked: true, kind: null };
}

function lockKindFor(accessLevel: LockableContentItem["accessLevel"]): LockKind {
  if (accessLevel === "VVIP") return "VVIP_SUBSCRIBE";
  if (accessLevel === "VIP") return "VIP_PASS";
  return null;
}
