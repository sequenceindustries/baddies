"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession, roleHomePath } from "@/components/ui";

/**
 * Landing page for the link emailed by sendUserEmailVerification
 * (src/lib/notifications/user-email-verification.ts) at registration.
 */
export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, refresh } = useSession();

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
        // Nav/Settings read emailVerified from the shared session —
        // refetch so a signed-in visitor sees it flip immediately.
        refresh();
      })
      .catch(() => {
        setErrorMessage("Something went wrong. Please try again.");
        setStatus("error");
      });
    // refresh is a fresh closure every render; this must run once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main style={{ padding: "4rem 1.75rem", maxWidth: "560px", margin: "0 auto" }}>
      {status === "checking" && <p>Verifying your email…</p>}
      {status === "error" && (
        <>
          <p style={{ color: "var(--danger)" }}>{errorMessage}</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {user ? (
              <>
                You can request a new link from{" "}
                <Link href="/settings" style={{ color: "var(--accent)" }}>
                  Settings
                </Link>
                .
              </>
            ) : (
              <>
                <Link href="/login" style={{ color: "var(--accent)" }}>
                  Sign in
                </Link>{" "}
                to request a new link from Settings.
              </>
            )}
          </p>
        </>
      )}
      {status === "ok" && (
        <>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 700 }}>Email verified</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
            Thanks — your email is confirmed. You&apos;re all set.
          </p>
          <Link
            href={user ? roleHomePath(user.role) : "/login"}
            style={{ display: "inline-block", marginTop: "1rem", color: "var(--accent)", fontWeight: 600 }}
          >
            {user ? "Continue to baddies →" : "Sign in →"}
          </Link>
        </>
      )}
    </main>
  );
}
