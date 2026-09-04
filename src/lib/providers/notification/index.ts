import type { NotificationProvider } from "./types";
import { StubNotificationProvider } from "./stub";
import { ResendNotificationProvider } from "./resend";

export * from "./types";

/**
 * Single place that resolves which NotificationProvider implementation
 * is active — mirrors getPaymentProvider()'s exact shape. Application
 * code must only ever call through this interface.
 */
export function getNotificationProvider(): NotificationProvider {
  const providerName = process.env.NOTIFICATION_PROVIDER ?? "stub";

  switch (providerName) {
    case "stub":
      return new StubNotificationProvider();
    case "resend":
      return new ResendNotificationProvider();
    default:
      throw new Error(
        `Unknown NOTIFICATION_PROVIDER "${providerName}". Register an implementation in src/lib/providers/notification/index.ts.`
      );
  }
}
