import { db } from "@/lib/db/client";

/**
 * Defines what counts as a "qualified" consumption event for Unlimited
 * allocation purposes. Per build brief §14: "Do not count simple page
 * impressions as meaningful consumption."
 *
 * A page load alone (GET /content/:id) must never call
 * `recordQualifiedConsumptionEvent`. Only signals that indicate genuine
 * engagement should — e.g. sustained video watch time past a minimum
 * threshold, full-image view duration, or an explicit "unlock" action for
 * Entry content under Unlimited.
 */

const MIN_VIDEO_WATCH_SECONDS = 10;
const MIN_IMAGE_VIEW_SECONDS = 3;

export interface RawConsumptionSignal {
  fanId: string;
  contentId: string;
  unlimitedSubscriptionId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO";
  engagedDurationSeconds: number;
}

export function isQualifiedConsumption(signal: RawConsumptionSignal): boolean {
  switch (signal.mediaType) {
    case "VIDEO":
    case "AUDIO":
      return signal.engagedDurationSeconds >= MIN_VIDEO_WATCH_SECONDS;
    case "IMAGE":
      return signal.engagedDurationSeconds >= MIN_IMAGE_VIEW_SECONDS;
    default:
      return false;
  }
}

/**
 * Records a QualifiedConsumptionEvent iff the signal clears the engagement
 * bar. Idempotent per (fan, content, subscription) within a short window
 * is intentionally NOT enforced here — that dedup policy belongs to
 * Sprint 5 once real usage patterns are observed; this Sprint 0 stub keeps
 * the write path simple but isolated so that policy can change later
 * without touching call sites.
 */
export async function recordQualifiedConsumptionEvent(
  signal: RawConsumptionSignal
): Promise<{ recorded: boolean }> {
  if (!isQualifiedConsumption(signal)) {
    return { recorded: false };
  }

  await db.qualifiedConsumptionEvent.create({
    data: {
      fanId: signal.fanId,
      contentId: signal.contentId,
      unlimitedSubscriptionId: signal.unlimitedSubscriptionId,
      durationSeconds: signal.engagedDurationSeconds,
      weight: 1.0,
    },
  });

  return { recorded: true };
}
