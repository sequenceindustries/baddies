import { describe, it, expect, afterEach } from "vitest";
import { StubWhatsappProvider } from "@/lib/providers/whatsapp/stub";
import { getWhatsappProvider } from "@/lib/providers/whatsapp";

describe("StubWhatsappProvider", () => {
  const original = process.env.BADDIES_WHATSAPP_NUMBER;
  afterEach(() => {
    if (original === undefined) delete process.env.BADDIES_WHATSAPP_NUMBER;
    else process.env.BADDIES_WHATSAPP_NUMBER = original;
  });

  it("builds a wa.me link with digits only, prefilled and URL-encoded", () => {
    process.env.BADDIES_WHATSAPP_NUMBER = "+27 82 123 4567";
    const link = new StubWhatsappProvider().buildClickToChatLink("Hi, I'm applying: Thandi");
    expect(link).toBe("https://wa.me/27821234567?text=Hi%2C%20I'm%20applying%3A%20Thandi");
  });

  it("still returns a usable (if empty-number) link when unset, rather than throwing", () => {
    delete process.env.BADDIES_WHATSAPP_NUMBER;
    const link = new StubWhatsappProvider().buildClickToChatLink("hello");
    expect(link).toBe("https://wa.me/?text=hello");
  });
});

describe("getWhatsappProvider", () => {
  const original = process.env.WHATSAPP_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.WHATSAPP_PROVIDER;
    else process.env.WHATSAPP_PROVIDER = original;
  });

  it("defaults to the stub provider when unset", () => {
    delete process.env.WHATSAPP_PROVIDER;
    expect(getWhatsappProvider().name).toBe("stub");
  });

  it("throws for an unregistered provider name", () => {
    process.env.WHATSAPP_PROVIDER = "twilio";
    expect(() => getWhatsappProvider()).toThrow(/Unknown WHATSAPP_PROVIDER/);
  });
});
