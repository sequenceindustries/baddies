"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Landing page for the link emailed by sendUserEmailVerification
 * (src/lib/notifications/user-email-verification.ts) at registration —
 * real-account equivalent of src/app/founding-baddies/verify-email/page.tsx.
 * No resume-panel concept here (unlike the Founding Baddies version):
 * a real account already has a login, there's nothing else to unlock.
 */
export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("This link is missing its verification token.");
      return;
    }
    fetch("/api/auth/verify-email", {
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

  return (
    <main style={{ padding: "4rem 1.75rem", maxWidth: "560px", margin: "0 auto" }}>
      {status === "checking" && <p>Verifying your email…</p>}
      {status === "error" && <p style={{ color: "var(--danger)" }}>{errorMessage}</p>}
      {status === "ok" && (
        <>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500 }}>Email verified</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
            Thanks — your email is confirmed. You&apos;re all set.
          </p>
        </>
      )}
    </main>
  );
}
