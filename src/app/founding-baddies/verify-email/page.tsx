"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ApplicationNextSteps from "../ApplicationNextSteps";

/**
 * Landing page for the link emailed by sendFoundingEmailVerification
 * (src/lib/notifications/email-verification.ts). Confirms the token via
 * POST /api/founding/verify-email, then shows the same "verify & upload"
 * panel as right after the original submission — this doubling is the
 * whole resumability mechanism for a Founding Baddie, who has no
 * account/login (see the plan's own note on this).
 */
export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("This link is missing its verification token.");
      return;
    }

    // The verify route only ever needs the token, never the application
    // id directly — but the panel below needs an id to poll /status
    // against, and this route doesn't return one (it's derived
    // server-side from the token, not something the client should have
    // to decode). Decoding the JWT payload client-side just to read a
    // non-secret claim is unnecessary — instead, thread the id through
    // as a second query param the email link already carries.
    fetch("/api/founding/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setErrorMessage(typeof body?.error === "string" ? body.error : "This link is invalid or has expired.");
          setStatus("error");
          return;
        }
        setStatus("ok");
      })
      .catch(() => {
        setErrorMessage("Something went wrong. Please try again.");
        setStatus("error");
      });
  }, [token]);

  const idFromLink = searchParams.get("id");
  useEffect(() => {
    if (idFromLink) setApplicationId(idFromLink);
  }, [idFromLink]);

  return (
    <main style={{ padding: "4rem 1.75rem", maxWidth: "720px", margin: "0 auto" }}>
      {status === "checking" && <p>Verifying your email…</p>}
      {status === "error" && <p style={{ color: "var(--danger)" }}>{errorMessage}</p>}
      {status === "ok" && (
        <>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500 }}>Email verified</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
            Thanks — your email is confirmed. Here&apos;s what&apos;s left on your Founding Baddie application:
          </p>
          {applicationId ? (
            <ApplicationNextSteps applicationId={applicationId} />
          ) : (
            <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
              Check your original confirmation for the rest of your application steps.
            </p>
          )}
        </>
      )}
    </main>
  );
}
