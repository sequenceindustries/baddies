import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

// Per-page title/description/canonical — without these every info page
// shared the site-wide default title and description (duplicate-content
// signals to search engines).
export const metadata: Metadata = {
  title: "Contact | baddies",
  description: "Get in touch with baddies — general enquiries, copyright, and trust & safety.",
  alternates: { canonical: "/contact" },
};

const BODY = [
  "We're building baddies as Africa's adult content network, and we'd like to hear from you — whether you're a creator, a fan with a question, or reporting a concern about content on the platform.",
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
