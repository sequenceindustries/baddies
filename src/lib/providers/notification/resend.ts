import type { NotificationProvider, SendEmailInput, SendEmailResult } from "./types";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Resend NotificationProvider — a single REST call, no SDK dependency
 * (this codebase deliberately keeps its dependency list small; Resend's
 * API is plain JSON over fetch). `RESEND_FROM_EMAIL` defaults to the
 * verified baddies.africa sending domain. Never point it at Resend's
 * shared sandbox sender (onboarding@resend.dev) in production: Resend
 * only delivers sandbox mail to the Resend account owner's own inbox, so
 * every other recipient's email (verification links included) is
 * rejected.
 */
const DEFAULT_FROM_EMAIL = "baddies <no-reply@baddies.africa>";

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
    this.fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;
    if (process.env.NODE_ENV === "production" && /@resend\.dev>?$/i.test(this.fromEmail)) {
      console.error(
        `[notification:resend] RESEND_FROM_EMAIL is Resend's sandbox sender (${this.fromEmail}) — Resend only delivers it to the account owner, so real users won't receive email. Set it to an address on the verified baddies.africa domain.`
      );
    }
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
      throw new Error(`Resend rejected the email (${res.status}): ${message}`);
    }

    return { providerMessageId: body?.id ?? null };
  }
}
