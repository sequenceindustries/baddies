import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

// Per-page title/description/canonical — without these every info page
// shared the site-wide default title and description (duplicate-content
// signals to search engines).
export const metadata: Metadata = {
  title: "Privacy Policy | baddies",
  description: "How baddies collects, uses and protects your personal information.",
  alternates: { canonical: "/privacy" },
};

const BODY = [
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
