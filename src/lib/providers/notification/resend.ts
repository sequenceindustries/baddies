import type { NotificationProvider, SendEmailInput, SendEmailResult } from "./types";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Resend NotificationProvider — a single REST call, no SDK dependency
 * (this codebase deliberately keeps its dependency list small; Resend's
 * API is plain JSON over fetch). `RESEND_FROM_EMAIL` defaults to
 * Resend's shared sandbox sender (works with no DNS setup); swap to a
 * verified @baddies.africa address once that domain is set up in
 * Resend — a separate, later task.
 */
export class ResendNotificationProvider implements NotificationProvider {
  readonly name = "resend";

  private readonly apiKey: string;
  private readonly fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set — required when NOTIFICATION_PROVIDER=resend.");
    }
    this.apiKey = apiKey;
    this.fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = body?.message ?? `Resend API error (${res.status})`;
      throw new Error(message);
    }

    return { providerMessageId: body?.id ?? null };
  }
}
