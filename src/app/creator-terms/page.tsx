import { LegalPage } from "@/components/legal-page";

// Mirrors the CREATOR_TERMS entry in prisma/agreements.ts (what creators
// formally accept during onboarding) — see privacy/page.tsx's comment on
// why this is a separate copy rather than a shared import.
const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify creators before any reviewed version replaces this one.";

const BODY = [
  DRAFT_NOTICE,
  "",
  "1. Eligibility. You must be 18 years or older and a South African resident to create content on baddies.",
  "2. Your account. You're responsible for the accuracy of the information you provide and for keeping your login credentials secure.",
  "3. Ownership. You retain ownership of the content you upload. You grant baddies a licence to host, stream, and display it to your subscribers for as long as your account and that content remain active.",
  "4. Revenue share. baddies' current creator/platform revenue split is shown in your Dashboard and can change with notice; it is never applied retroactively to earnings already recorded.",
  "5. Conduct. You agree not to upload content that violates the Content Policy, misrepresents who is depicted, or infringes anyone else's rights.",
  "6. Verification. Your account remains in review status until baddies completes identity and, where applicable, banking verification. baddies may suspend or reject an account that fails verification.",
  "7. Termination. Either you or baddies may end this agreement at any time. Content already purchased by a subscriber remains accessible to them per the Content Policy.",
  "8. Changes. baddies may update these terms; continuing to use baddies after a new version takes effect means you accept it.",
].join("\n");

export default function CreatorTermsPage() {
  return <LegalPage title="Creator Terms" bodyText={BODY} />;
}
