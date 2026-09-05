import { LegalPage } from "@/components/legal-page";

const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify users before any reviewed version replaces this one.";

const BODY = [
  DRAFT_NOTICE,
  "",
  "1. baddies is an adult content network. Every visitor must confirm they are 18 years of age or older — or the age of majority in their jurisdiction, whichever is higher — before entering the site.",
  "2. Fans self-declare their age at the entry gate and again when registering an account. baddies may take further steps to confirm a user's age where required by law.",
  "3. Every creator must pass identity and age verification, including a live, non-fabricated capture reviewed by baddies staff, before their account can be approved. See the Creator Terms for details.",
  "4. Anyone found to have misrepresented their age will have their account suspended immediately.",
  "5. If you believe someone under 18 is depicted in or has accessed content on baddies, contact us immediately via the Contact page — this is treated as the highest priority.",
].join("\n");

export default function AgePolicyPage() {
  return <LegalPage title="18+ / Age Policy" bodyText={BODY} />;
}
