import { db } from "@/lib/db/client";
import type { Content, User } from "@prisma/client";

/**
 * Central entitlement engine. Per build brief §15:
 * "Do not hard-code access logic into individual pages... Use a central
 * concept such as canAccessContent(user, content)."
 *
 * Every code path that serves media (API routes, server components,
 * signed-URL issuance) must call this instead of re-deriving access rules.
 */

export type EntitlementReason =
  | "public_preview"
  | "own_content"
  | "admin_override"
  | "active_entry_subscription"
  | "active_vip_subscription"
  | "ppv_purchase"
  | "unlimited_subscription"
  | "denied";

export interface EntitlementResult {
  allowed: boolean;
  reason: EntitlementReason;
}

export async function canAccessContent(
  user: Pick<User, "id" | "role"> | null,
  content: Pick<Content, "id" | "creatorProfileId" | "accessLevel" | "status" | "publishedAt">
): Promise<EntitlementResult> {
  // Content must have cleared moderation (APPROVED) AND been explicitly
  // published by the creator (publishedAt set) to be accessible by anyone
  // other than its own creator or an admin. These are deliberately
  // separate gates — see build brief §10: moderation approval alone does
  // not put content in front of fans; the creator still chooses when to
  // publish.
  const isLive = content.status === "APPROVED" && content.publishedAt != null;

  if (content.accessLevel === "PUBLIC_PREVIEW" && isLive) {
    return { allowed: true, reason: "public_preview" };
  }

  if (!user) {
    return { allowed: false, reason: "denied" };
  }

  if (user.role === "ADMIN") {
    return { allowed: true, reason: "admin_override" };
  }

  // Owning creator can always access their own content, live or not.
  const ownsContent = await db.creatorProfile.findFirst({
    where: { id: content.creatorProfileId, userId: user.id },
    select: { id: true },
  });
  if (ownsContent) {
    return { allowed: true, reason: "own_content" };
  }

  if (!isLive) {
    return { allowed: false, reason: "denied" };
  }

  const now = new Date();

  if (content.accessLevel === "ENTRY" || content.accessLevel === "VIP") {
    const requiredTiers = content.accessLevel === "ENTRY" ? ["ENTRY", "VIP"] : ["VIP"];
    const activeSub = await db.subscription.findFirst({
      where: {
        fanId: user.id,
        creatorProfileId: content.creatorProfileId,
        tier: { in: requiredTiers as ("ENTRY" | "VIP")[] },
        status: "ACTIVE",
        currentPeriodEnd: { gte: now },
      },
      select: { tier: true },
    });
    if (activeSub) {
      return {
        allowed: true,
        reason: activeSub.tier === "VIP" ? "active_vip_subscription" : "active_entry_subscription",
      };
    }

    // Entry-level content also qualifies under an active Unlimited
    // subscription, if this creator participates. VIP/PPV are excluded
    // per build brief §2 — Unlimited never auto-includes them.
    if (content.accessLevel === "ENTRY") {
      const unlimitedResult = await checkUnlimitedAccess(user.id, content.creatorProfileId);
      if (unlimitedResult.allowed) return unlimitedResult;
    }

    return { allowed: false, reason: "denied" };
  }

  if (content.accessLevel === "PPV") {
    const purchase = await db.purchase.findFirst({
      where: { fanId: user.id, contentId: content.id, refundedAt: null },
      select: { id: true },
    });
    if (purchase) {
      return { allowed: true, reason: "ppv_purchase" };
    }
    return { allowed: false, reason: "denied" };
  }

  return { allowed: false, reason: "denied" };
}

async function checkUnlimitedAccess(
  fanId: string,
  creatorProfileId: string
): Promise<EntitlementResult> {
  const creator = await db.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { unlimitedOptedIn: true },
  });
  if (!creator?.unlimitedOptedIn) {
    return { allowed: false, reason: "denied" };
  }

  const activeUnlimited = await db.unlimitedSubscription.findFirst({
    where: {
      fanId,
      status: "ACTIVE",
      currentPeriodEnd: { gte: new Date() },
    },
    select: { id: true },
  });

  return activeUnlimited
    ? { allowed: true, reason: "unlimited_subscription" }
    : { allowed: false, reason: "denied" };
}
