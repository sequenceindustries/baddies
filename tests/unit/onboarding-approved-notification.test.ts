import { describe, it, expect } from "vitest";
import { buildOnboardingApprovedEmail } from "@/lib/notifications/onboarding-approved";

describe("buildOnboardingApprovedEmail", () => {
  it("includes the applicant's stage name and the onboarding URL", () => {
    const { subject, text } = buildOnboardingApprovedEmail(
      "Thandi",
      "https://baddies.africa/founding-baddies/complete-onboarding?token=abc"
    );
    expect(subject).toContain("approved");
    expect(text).toContain("Hi Thandi,");
    expect(text).toContain("https://baddies.africa/founding-baddies/complete-onboarding?token=abc");
    expect(text).toContain("30 days");
  });
});
