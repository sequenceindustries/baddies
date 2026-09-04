import type { WhatsappProvider } from "./types";

/**
 * V1 default — no real WhatsApp Business API call. Builds a plain wa.me
 * link to BADDIES_WHATSAPP_NUMBER; actual "verification" is an admin
 * manually setting Contact.whatsappVerifiedAt once the applicant's
 * message arrives (see the founding-applications admin route). If
 * BADDIES_WHATSAPP_NUMBER isn't set, the link points nowhere usable —
 * callers should treat an empty env var as "WhatsApp step not
 * configured yet" rather than crash.
 */
export class StubWhatsappProvider implements WhatsappProvider {
  readonly name = "stub";

  buildClickToChatLink(prefillText: string): string {
    const number = process.env.BADDIES_WHATSAPP_NUMBER ?? "";
    const digitsOnly = number.replace(/[^\d]/g, "");
    return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(prefillText)}`;
  }
}
