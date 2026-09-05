import { LegalPage } from "@/components/legal-page";

const BODY = [
  "We're building baddies as Africa's adult content network, and we'd like to hear from you — whether you're a prospective Founding baddie, a fan with a question, or reporting a concern about content on the platform.",
  "",
  "General enquiries: support@baddies.africa",
  "Copyright & content removal (DMCA): legal@baddies.africa",
  "Trust & safety concerns (including reports involving a minor): safety@baddies.africa",
  "",
  "We aim to respond to all enquiries as quickly as we can. Trust & safety and copyright reports are prioritised.",
].join("\n");

export default function ContactPage() {
  return <LegalPage title="Contact" bodyText={BODY} />;
}
