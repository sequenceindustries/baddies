"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ApplicationNextSteps from "../ApplicationNextSteps";

/**
 * The canonical place a Founding Baddie applicant lands to check their
 * status — reached automatically right after submitting the identity
 * step (see ApplicationNextSteps' IdentityForm), and revisitable any
 * time via the same link, since it's keyed only by the application's
 * unguessable id (no account/login exists at this stage — same
 * resumability model as /founding-baddies/verify-email). Fetches its own
 * copy of the status just for the heading (stage name, overall status);
 * ApplicationNextSteps does its own fetch for the step checklist itself.
 */
export default function FoundingBaddieDashboardPage() {
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("id");

  const [stageName, setStageName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    fetch(`/api/founding/apply/${applicationId}/status`)
      .then((r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((body: { stageName?: string; status?: string } | null) => {
        if (!cancelled && body) {
          setStageName(body.stageName ?? null);
          setStatus(body.status ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (!applicationId) {
    return (
      <main style={wrapStyle}>
        <h1 style={headingStyle}>No application found</h1>
        <p style={subStyle}>This link is missing its application reference. Check your original confirmation email.</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main style={wrapStyle}>
        <h1 style={headingStyle}>Application not found</h1>
        <p style={subStyle}>We couldn&apos;t find an application matching this link.</p>
      </main>
    );
  }

  return (
    <main style={wrapStyle}>
      <h1 style={headingStyle}>{stageName ? `Welcome back, ${stageName}` : "Your application"}</h1>
      <p style={subStyle}>
        {status === "VERIFIED" || status === "APPROVED" || status === "ONBOARDING" || status === "CONTENT_READY" || status === "LIVE"
          ? "Your identity is verified — here's where things stand."
          : "Here's where things stand with your Founding Baddie application."}
      </p>
      <ApplicationNextSteps applicationId={applicationId} />
    </main>
  );
}

const wrapStyle: React.CSSProperties = { padding: "4rem 1.75rem", maxWidth: "720px", margin: "0 auto" };
const headingStyle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500, margin: 0 };
const subStyle: React.CSSProperties = { color: "var(--text-muted)", marginTop: "0.4rem" };
