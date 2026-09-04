import { getNotificationProvider } from "@/lib/providers/notification";

export interface FoundingApplicationSummary {
  fullName: string;
  stageName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  audienceSize?: string | null;
}

/**
 * Pure — no network, no env reads — so it's unit-testable without
 * mocking fetch. Kept separate from the send wrapper below.
 */
export function buildFoundingApplicationEmail(app: FoundingApplicationSummary): { subject: string; text: string } {
  const appUrl = process.env.APP_URL ?? "https://baddies.africa";
  const subject = `New Founding Baddie application: ${app.stageName}`;
  const text = [
    `${app.stageName} (${app.fullName}) just applied to become a Founding Baddie.`,
    "",
    `Email: ${app.email}`,
    `Phone: ${app.phone}`,
    `Location: ${app.city}, ${app.country}`,
    app.audienceSize ? `Audience: ${app.audienceSize}` : null,
    "",
    `Review it: ${appUrl}/admin`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return { subject, text };
}

/**
 * Called from POST /api/founding/apply after the row is written. The
 * caller wraps this in its own try/catch — a notification failure must
 * never fail or block the applicant's submission (see the standing
 * to-do memory this implements: "must not block or fail the
 * application submission itself if the email send errors").
 */
export async function notifyFoundingApplicationReceived(app: FoundingApplicationSummary): Promise<void> {
  const to = process.env.FOUNDING_APPLICATION_NOTIFY_EMAIL;
  if (!to) {
    console.warn("[notifications] FOUNDING_APPLICATION_NOTIFY_EMAIL is not set — skipping founding application notification.");
    return;
  }
  const { subject, text } = buildFoundingApplicationEmail(app);
  await getNotificationProvider().sendEmail({ to, subject, text });
}
