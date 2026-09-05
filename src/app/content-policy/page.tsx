import { LegalPage } from "@/components/legal-page";

// Mirrors the CONTENT_POLICY entry in prisma/agreements.ts (what creators
// formally accept during onboarding) — see privacy/page.tsx's comment on
// why this is a separate copy rather than a shared import.
const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify creators before any reviewed version replaces this one.";

const BODY = [
  DRAFT_NOTICE,
  "",
  "1. Everyone depicted must be 18 or older and have given informed consent to appear in the content and to its being published on baddies.",
  "2. Non-consensual content, content involving minors, and content obtained or shared without the depicted person's consent are never permitted, with no exceptions.",
  "3. If content involves a person other than the creator, the creator is responsible for that person's verification and consent records — baddies may request evidence of both at any time.",
  "4. Illegal content of any kind is prohibited and will be removed; baddies may report it to the relevant authorities where required by law.",
  "5. Tier placement (Free / VIP / Exclusive) is set per upload by the creator and reviewed by baddies before publishing.",
  "6. baddies may remove content or suspend an account that violates this policy, and will record the reason in that account's audit history.",
  "7. To report content or request its removal, see our DMCA / Copyright & Content Removal page.",
].join("\n");

export default function ContentPolicyPage() {
  return <LegalPage title="Content Policy" bodyText={BODY} />;
}
