import Link from "next/link";
import { displayHeadingStyle } from "@/components/ui";

/**
 * Shared shell for the site's legal/policy pages (Terms, Privacy, Creator
 * Terms, Content Policy, Age Policy, DMCA, Contact) — added as part of
 * the homepage footer's legal navigation. Reuses the same heading style
 * as every other page shell (login/register/apply via pageWrapStyle) but
 * with a wider reading column, since pageWrapStyle's 440px is sized for
 * narrow forms, not body-text paragraphs.
 *
 * bodyText is plain "\n"-separated lines (same shape as
 * prisma/agreements.ts, which some of these pages mirror) — blank lines
 * become spacing, everything else renders as a paragraph.
 */
export function LegalPage({ title, bodyText }: { title: string; bodyText: string }) {
  return (
    <main style={wrapStyle}>
      <h1 style={displayHeadingStyle}>{title}</h1>
      <div style={bodyStyle}>
        {bodyText.split("\n").map((line, i) =>
          line.trim() === "" ? <div key={i} style={{ height: "0.75rem" }} /> : <p key={i} style={paragraphStyle}>{line}</p>
        )}
      </div>
      <Link href="/" style={backLinkStyle}>
        ← Back to baddies
      </Link>
    </main>
  );
}

const wrapStyle: React.CSSProperties = {
  maxWidth: "720px",
  margin: "3.5rem auto 4rem",
  padding: "0 1.5rem",
};

const bodyStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "0.95rem",
  lineHeight: 1.7,
};

const paragraphStyle: React.CSSProperties = {
  margin: 0,
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: "2rem",
  color: "var(--accent)",
  textDecoration: "none",
  fontSize: "0.9rem",
  fontWeight: 600,
};
