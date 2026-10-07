import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

// Per-page title/description/canonical — without these every info page
// shared the site-wide default title and description (duplicate-content
// signals to search engines).
export const metadata: Metadata = {
  title: "Content Policy | baddies",
  description: "What can and can't be published on baddies, and how content is moderated.",
  alternates: { canonical: "/content-policy" },
};

const BODY = [
  "1. Everyone depicted must be 18 or older and have given informed consent to appear in the content and to its being published on baddies.",
  "2. Non-consensual content, content involving minors, and content obtained or shared without the depicted person's consent are never permitted, with no exceptions.",
  "3. If content involves a person other than the creator, the creator is responsible for that person's verification and consent records — baddies may request evidence of both at any time.",
  "4. Illegal content of any kind is prohibited and will be removed; baddies may report it to the relevant authorities where required by law.",
  "5. Tier placement (Teasers / VIP / Exclusive) is set per upload by the creator and reviewed by baddies before publishing.",
  "6. baddies may remove content or suspend an account that violates this policy, and will record the reason in that account's audit history.",
  "7. To report content or request its removal, see our DMCA / Copyright & Content Removal page.",
].join("\n");

export default function ContentPolicyPage() {
  return <LegalPage title="Content Policy" bodyText={BODY} />;
}
