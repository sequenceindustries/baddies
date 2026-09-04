import type { NotificationProvider, SendEmailInput, SendEmailResult } from "./types";

/**
 * Stub NotificationProvider — logs instead of sending, for local dev
 * and tests. `NOTIFICATION_PROVIDER=stub` is the default everywhere
 * this hasn't been explicitly configured, same as every other stub
 * provider in this app.
 */
export class StubNotificationProvider implements NotificationProvider {
  readonly name = "stub";

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    console.log(`[notification:stub] would send to ${input.to}: "${input.subject}"\n${input.text}`);
    return { providerMessageId: null };
  }
}
