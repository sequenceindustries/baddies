/**
 * NotificationProvider — abstraction over the email/notification sender.
 * Same reasoning as PaymentProvider/StorageProvider/VerificationProvider
 * (see their own type files): application code never talks to a vendor
 * SDK directly, only through this interface, so the real provider can
 * be swapped or added to without touching call sites.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  providerMessageId: string | null;
}

export interface NotificationProvider {
  readonly name: string;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
