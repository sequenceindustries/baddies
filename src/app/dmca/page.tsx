import { LegalPage } from "@/components/legal-page";

const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify users before any reviewed version replaces this one.";

const BODY = [
  DRAFT_NOTICE,
  "",
  "baddies respects intellectual property rights and responds to valid notices of copyright infringement, and to reports of non-consensual or otherwise unlawful content.",
  "",
  "1. To request removal of content, send a written notice to legal@baddies.africa including:",
  "   • Your contact details.",
  "   • A description of the content and a link to where it appears on baddies.",
  "   • A statement of your relationship to the content (e.g. copyright owner, or the person depicted) and, for copyright claims, a good-faith statement that use of the content is unauthorised.",
  "2. baddies will review valid notices and remove or disable access to the reported content while the claim is investigated.",
  "3. A creator whose content is removed may submit a counter-notice explaining why the content should be restored; baddies reviews these on a case-by-case basis.",
  "4. Reports involving a minor, or content shared without the depicted person's consent, are treated as the highest priority and are never subject to a counter-notice or restoration.",
  "5. Repeat infringement by a creator account will result in suspension or termination of that account.",
].join("\n");

export default function DmcaPage() {
  return <LegalPage title="DMCA / Copyright & Content Removal" bodyText={BODY} />;
}
