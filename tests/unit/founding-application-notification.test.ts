import { describe, it, expect, afterEach } from "vitest";
import { buildFoundingApplicationEmail } from "@/lib/notifications/founding-application";

describe("buildFoundingApplicationEmail", () => {
  const app = {
    fullName: "Thandiwe Mokoena",
    stageName: "Thandi",
    email: "thandi@example.com",
    phone: "+27821234567",
    country: "South Africa",
    city: "Cape Town",
    audienceSize: "~12k across platforms",
  };

  const originalAppUrl = process.env.APP_URL;
  afterEach(() => {
    process.env.APP_URL = originalAppUrl;
  });

  it("includes the applicant's identity and contact details", () => {
    const { subject, text } = buildFoundingApplicationEmail(app);
    expect(subject).toContain("Thandi");
    expect(text).toContain("Thandi (Thandiwe Mokoena)");
    expect(text).toContain("thandi@example.com");
    expect(text).toContain("+27821234567");
    expect(text).toContain("Cape Town, South Africa");
    expect(text).toContain("~12k across platforms");
  });

  it("omits the audience line entirely when not provided, rather than an empty line", () => {
    const { text } = buildFoundingApplicationEmail({ ...app, audienceSize: undefined });
    expect(text).not.toContain("Audience:");
  });

  it("links to /admin on the configured APP_URL", () => {
    process.env.APP_URL = "https://baddies.africa";
    const { text } = buildFoundingApplicationEmail(app);
    expect(text).toContain("https://baddies.africa/admin");
  });

  it("falls back to the production URL when APP_URL isn't set", () => {
    delete process.env.APP_URL;
    const { text } = buildFoundingApplicationEmail(app);
    expect(text).toContain("https://baddies.africa/admin");
  });
});
