import { describe, it, expect } from "vitest";
import { buildUserEmailVerificationEmail } from "@/lib/notifications/user-email-verification";

describe("buildUserEmailVerificationEmail", () => {
  it("includes the recipient's display name and the verify URL", () => {
    const { subject, text } = buildUserEmailVerificationEmail("Thandi", "https://baddies.africa/verify-email?token=abc");
    expect(subject).toContain("Verify your email");
    expect(text).toContain("Hi Thandi,");
    expect(text).toContain("https://baddies.africa/verify-email?token=abc");
    expect(text).toContain("48 hours");
  });
});
