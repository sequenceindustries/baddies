import type { WhatsappProvider } from "./types";
import { StubWhatsappProvider } from "./stub";

export * from "./types";

/**
 * Single place that resolves which WhatsappProvider implementation is
 * active — mirrors getNotificationProvider()'s exact shape. Application
 * code must only ever call through this interface.
 */
export function getWhatsappProvider(): WhatsappProvider {
  const providerName = process.env.WHATSAPP_PROVIDER ?? "stub";

  switch (providerName) {
    case "stub":
      return new StubWhatsappProvider();
    default:
      throw new Error(
        `Unknown WHATSAPP_PROVIDER "${providerName}". Register an implementation in src/lib/providers/whatsapp/index.ts.`
      );
  }
}
