import { describe, it, expect } from "vitest";
import { buildEmailVerificationEmail } from "@/lib/notifications/email-verification";

describe("buildEmailVerificationEmail", () => {
  it("includes the applicant's stage name and the verify URL", () => {
    const { subject, text } = buildEmailVerificationEmail("Thandi", "https://baddies.africa/founding-baddies/verify-email?token=abc&id=xyz");
    expect(subject).toContain("Verify your email");
    expect(text).toContain("Hi Thandi,");
    expect(text).toContain("https://baddies.africa/founding-baddies/verify-email?token=abc&id=xyz");
    expect(text).toContain("48 hours");
  });
});
