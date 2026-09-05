/**
 * Seed content for the `Agreement` model (MASTER REQUIREMENTS §4).
 *
 * This is placeholder text, not reviewed by a lawyer — every document
 * says so in its own opening line, both here and wherever it's rendered
 * (see src/app/founding-baddies/complete-onboarding/page.tsx). It's
 * written to be genuinely sensible for this platform (a South African
 * adult-content creator subscription platform — see AGREEMENTS below
 * for what each document actually needs to cover), not filler text, so
 * the acceptance/versioning/audit-trail mechanics this phase builds are
 * exercised against something real. Replace with reviewed text as a new
 * `version` entry when ready — never edit an existing version's body in
 * place (see the Agreement model's own schema comment for why).
 */

const DRAFT_NOTICE =
  "DRAFT — placeholder text pending review by a qualified attorney. Not final, not legally reviewed. Baddies will notify creators before any reviewed version replaces this one.";

export interface AgreementSeed {
  type: "CREATOR_TERMS" | "CONTENT_POLICY" | "PRIVACY_POLICY" | "PAYOUT_AGREEMENT" | "PARTNER_AGREEMENT";
  version: string;
  title: string;
  bodyText: string;
}

export const AGREEMENTS: AgreementSeed[] = [
  {
    type: "CREATOR_TERMS",
    version: "v1",
    title: "Creator Terms",
    bodyText: [
      DRAFT_NOTICE,
      "",
      "1. Eligibility. You must be 18 years or older and a South African resident to create content on Baddies.",
      "2. Your account. You're responsible for the accuracy of the information you provide and for keeping your login credentials secure.",
      "3. Ownership. You retain ownership of the content you upload. You grant Baddies a licence to host, stream, and display it to your subscribers for as long as your account and that content remain active.",
      "4. Revenue share. Baddies' current creator/platform revenue split is shown in your Dashboard and can change with notice; it is never applied retroactively to earnings already recorded.",
      "5. Conduct. You agree not to upload content that violates the Content Policy, misrepresents who is depicted, or infringes anyone else's rights.",
      "6. Verification. Your account remains in review status until Baddies completes identity and, where applicable, banking verification. Baddies may suspend or reject an account that fails verification.",
      "7. Termination. Either you or Baddies may end this agreement at any time. Content already purchased by a subscriber remains accessible to them per the Content Policy.",
      "8. Changes. Baddies may update these terms; continuing to use Baddies after a new version takes effect means you accept it.",
    ].join("\n"),
  },
  {
    type: "CONTENT_POLICY",
    version: "v1",
    title: "Content Policy",
    bodyText: [
      DRAFT_NOTICE,
      "",
      "1. Everyone depicted must be 18 or older and have given informed consent to appear in the content and to its being published on Baddies.",
      "2. Non-consensual content, content involving minors, and content obtained or shared without the depicted person's consent are never permitted, with no exceptions.",
      "3. If content involves a person other than you, you're responsible for that person's verification and consent records — Baddies may request evidence of both at any time.",
      "4. Illegal content of any kind is prohibited and will be removed; Baddies may report it to the relevant authorities where required by law.",
      "5. Tier placement (Free / VIP / VVIP) is set per upload by the creator and reviewed by Baddies before publishing.",
      "6. Baddies may remove content or suspend an account that violates this policy, and will record the reason in your account's audit history.",
    ].join("\n"),
  },
  {
    type: "PRIVACY_POLICY",
    version: "v1",
    title: "Privacy Policy",
    bodyText: [
      DRAFT_NOTICE,
      "",
      "1. What we collect. Account details (email, phone), identity verification documents, banking details for payouts, and usage data needed to operate the platform.",
      "2. Why we collect it. To verify you're eligible to create on Baddies, to pay you, to keep the platform safe, and to meet our own legal obligations.",
      "3. Identity documents and banking details are encrypted and stored separately from your public profile; they are never shown publicly and are only ever accessed by authorised Baddies staff for verification, payouts, or fraud prevention.",
      "4. We don't sell your personal information to third parties.",
      "5. Data is kept for as long as your account is active, plus whatever retention period the law requires afterward for financial and verification records.",
      "6. You can request a copy of the personal information Baddies holds about you, or ask that it be corrected, by contacting Baddies directly.",
    ].join("\n"),
  },
  {
    type: "PAYOUT_AGREEMENT",
    version: "v1",
    title: "Payout Agreement",
    bodyText: [
      DRAFT_NOTICE,
      "",
      "1. Banking details. You confirm the bank account you provide belongs to you (or, for a business account, to an entity you're authorised to receive payments on behalf of), and that the details are accurate.",
      "2. Verification. Baddies verifies banking details through an external process before the first payout; a mismatch or failed verification will delay payment until corrected.",
      "3. Payout timing and minimums are shown in your Dashboard and may change with notice.",
      "4. Baddies deducts its platform share (see the Creator Terms) before calculating your payout; the deduction is recorded against each earning at the time it's earned, not recalculated later.",
      "5. You're responsible for reporting and paying any tax owed on your Baddies income under South African law.",
      "6. If a payout fails because of incorrect banking details you provided, Baddies will attempt to reach you to correct them before retrying.",
    ].join("\n"),
  },
  {
    type: "PARTNER_AGREEMENT",
    version: "v1",
    title: "Founding Partner Agreement",
    bodyText: [
      DRAFT_NOTICE,
      "",
      "1. The programme. Baddies is inviting a small number of Founding Partners — no more than 10 at any time — to help bring the first generation of creators onto the platform.",
      "2. Referral relationship. Each Founding Partner receives a unique referral link. A creator who applies through that link is attributed to that Partner for as long as the attribution stands; Baddies may correct an attribution, always with a recorded reason.",
      "3. Creator revenue share. A creator attributed to a Founding Partner earns a higher revenue share than the platform's standard rate, exactly as shown in the current Revenue Share Rules; this does not entitle the Partner to any portion of that creator's earnings directly.",
      "4. Profit-pool participation. Founding Partners collectively participate in a share of Baddies' annual distributable profit pool, split among however many Partners are active that year. This is calculated once a year from Baddies' real financial results — never estimated, projected, or paid in advance — and only after Baddies has actual distributable profit to allocate.",
      "5. No guarantee. Nothing in this agreement guarantees any referral, any creator's success, or any profit-pool payout in a given year.",
      "6. Confidentiality. Referral data, other Partners' information, and any commercial terms shared with you as a Partner are confidential and must not be shared outside the programme.",
      "7. Standing. Baddies may suspend a Founding Partner's status for a violation of this agreement or of the Content Policy; suspension ends future referral attribution and profit-pool eligibility but does not undo attributions already recorded.",
      "8. Changes. Baddies may update this agreement; continuing to participate in the programme after a new version takes effect means you accept it.",
    ].join("\n"),
  },
];
