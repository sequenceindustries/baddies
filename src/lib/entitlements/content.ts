import { db } from "@/lib/db/client";
import type { Content, User } from "@prisma/client";

/**
 * Central entitlement engine. Per build brief §15:
 * "Do not hard-code access logic into individual pages... Use a central
 * concept such as canAccessContent(user, content)."
 *
 * Every code path that serves media (API routes, server components,
 * signed-URL issuance) must call this instead of re-deriving access rules.
 *
 * Tier model (see prisma/schema.prisma's ContentAccessLevel comment):
 *   FREE — anyone, once live
 *   VIP  — that creator's own VVIP subscribers, OR any fan holding the
 *          platform-wide VIP pass (UnlimitedSubscription) IF this creator
 *          has opted their VIP content into it (unlimitedOptedIn)
 *   VVIP — only that creator's own active subscribers
 */

export type EntitlementReason =
  | "free_preview"
  | "own_content"
  | "admin_override"
  | "active_vvip_subscription"
  | "vip_pass"
  | "ppv_purchase" // legacy — no code path can create PPV content anymore, kept defensively
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

  if (content.accessLevel === "FREE" && isLive) {
    return { allowed: true, reason: "free_preview" };
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

  if (content.accessLevel === "VVIP" || content.accessLevel === "VIP") {
    // A VVIP subscriber to this specific creator sees everything of
    // theirs, VIP-tier included — same "higher tier includes lower tier"
    // relationship the old ENTRY/VIP split had.
    const activeSub = await db.subscription.findFirst({
      where: {
        fanId: user.id,
        creatorProfileId: content.creatorProfileId,
        status: "ACTIVE",
        currentPeriodEnd: { gte: now },
      },
      select: { id: true },
    });
    if (activeSub) {
      return { allowed: true, reason: "active_vvip_subscription" };
    }

    if (content.accessLevel === "VVIP") {
      // No fallback — VVIP is exclusive to this creator's own subscribers.
      return { allowed: false, reason: "denied" };
    }

    // VIP-tier content also qualifies under the platform-wide VIP pass,
    // if this creator has opted in. VVIP is never included, matching the
    // old "Unlimited never auto-includes VIP/PPV" rule.
    const vipPassResult = await checkVipPassAccess(user.id, content.creatorProfileId);
    if (vipPassResult.allowed) return vipPassResult;

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

/**
 * Checks the platform-wide VIP pass (UnlimitedSubscription — model name
 * kept to limit the rename's blast radius, see src/lib/config/business.ts
 * for where the user-facing "VIP pass" naming lives instead).
 */
async function checkVipPassAccess(
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

  const activeVipPass = await db.unlimitedSubscription.findFirst({
    where: {
      fanId,
      status: "ACTIVE",
      currentPeriodEnd: { gte: new Date() },
    },
    select: { id: true },
  });

  return activeVipPass ? { allowed: true, reason: "vip_pass" } : { allowed: false, reason: "denied" };
}
