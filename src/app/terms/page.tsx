import { LegalPage } from "@/components/legal-page";

const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify users before any reviewed version replaces this one.";

const BODY = [
  DRAFT_NOTICE,
  "",
  "1. Eligibility. You must be 18 years or older — or the age of majority in your jurisdiction, whichever is higher — to create an account or use baddies.",
  "2. What baddies is. baddies is Africa's adult content network, connecting independent verified creators directly with the fans who support them.",
  "3. Your account. You're responsible for the accuracy of the information you provide and for keeping your login credentials secure.",
  "4. Fan purchases. Subscriptions and tips are billed as described at checkout. Access to paid content lasts for as long as your subscription remains active, per the Content Policy.",
  "5. Creator content. Creators retain ownership of the content they publish; baddies hosts and displays it under a licence from the creator. See the Creator Terms and Content Policy for what creators agree to.",
  "6. Acceptable use. You agree not to misuse baddies — including attempting to access another user's account, redistributing paid content, or using the platform for anything unlawful.",
  "7. Termination. baddies may suspend or close an account that violates these terms or the Content Policy.",
  "8. Governing law. These terms are governed by the laws of South Africa.",
  "9. Changes. baddies may update these terms; continuing to use baddies after a new version takes effect means you accept it.",
].join("\n");

export default function TermsPage() {
  return <LegalPage title="Terms of Service" bodyText={BODY} />;
}
