import { LegalPage } from "@/components/legal-page";

// Mirrors the PRIVACY_POLICY entry in prisma/agreements.ts (what creators
// formally accept during onboarding) — kept as a separate copy rather than
// a shared import, since this public page and that versioned in-app
// acceptance record are different concerns that may reasonably diverge
// over time (see that file's own comment on why versions aren't edited
// in place).
const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify users before any reviewed version replaces this one.";

const BODY = [
  DRAFT_NOTICE,
  "",
  "1. What we collect. Account details (email, phone), identity verification documents and images (for creators), banking details for payouts (for creators), and usage data needed to operate the platform.",
  "2. Why we collect it. To verify creators are eligible to publish on baddies, to pay creators, to keep the platform safe, and to meet our own legal obligations.",
  "3. Identity documents and banking details are encrypted and stored separately from public profiles; they are never shown publicly and are only ever accessed by authorised baddies staff for verification, payouts, or fraud prevention.",
  "4. We don't sell your personal information to third parties.",
  "5. Data is kept for as long as your account is active, plus whatever retention period the law requires afterward for financial and verification records.",
  "6. You can request a copy of the personal information baddies holds about you, or ask that it be corrected, by contacting baddies directly.",
].join("\n");

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" bodyText={BODY} />;
}
