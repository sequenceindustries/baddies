/**
 * WhatsApp is required for creator contact verification (MASTER
 * REQUIREMENTS §1) but real WhatsApp Business API integration (Twilio,
 * Meta Cloud API) needs a paid account and template approval — exactly
 * the "expensive third-party system" the spec says to skip for V1 (§18).
 * So V1's method is: applicant messages a known number via a click-to-
 * chat link, an admin manually confirms once they reply (see
 * Contact.whatsappVerifiedAt / whatsappVerifiedBy in prisma/schema.prisma).
 *
 * This interface exists so a real OTP-sending provider can be swapped in
 * later (see getWhatsappProvider() in ./index.ts) without any data-model
 * change — Contact.whatsappMethod is already a free-text string, not an
 * enum, for the same reason.
 */
export interface WhatsappProvider {
  readonly name: string;

  /**
   * Builds a wa.me click-to-chat link to Baddies' own WhatsApp number
   * (the destination — read from config by the implementation, not a
   * parameter here), pre-filled with `prefillText` so the applicant's
   * message arrives already identifying who they are. There's no sender
   * number to pass in: a wa.me link always sends from whichever WhatsApp
   * account the applicant opens it with.
   */
  buildClickToChatLink(prefillText: string): string;
}
