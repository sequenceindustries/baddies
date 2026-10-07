"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { transitions } from "@/lib/motion/tokens";
import { VerificationFlow } from "@/components/verification-capture";

type PendingStatus = "PENDING" | "VERIFICATION_REQUIRED" | "UNDER_REVIEW";
type StepState = "done" | "action" | "waiting" | "upcoming";

interface Step {
  key: string;
  title: string;
  state: StepState;
  label: string;
  detail: string;
}

/**
 * The creator dashboard's "where do I stand" panel, shown on /profile from
 * the moment a creator application is submitted until it's approved. It
 * replaces a bare "Status: VERIFICATION_REQUIRED" line with the four
 * real stages (account → email → identity → review), the one thing to do
 * next, and what's locked until approval — every state here is derived
 * from real data (session emailVerified + CreatorProfile.status), never
 * assumed. The identity wizard (VerificationFlow) opens inline so the
 * creator never has to leave their dashboard to finish it.
 */
export function CreatorOnboardingPanel({
  status,
  displayName,
  emailVerified,
}: {
  status: PendingStatus;
  displayName: string | null;
  emailVerified: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [verifyOpen, setVerifyOpen] = useState(status === "VERIFICATION_REQUIRED");
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  const identityDone = status === "UNDER_REVIEW";
  const steps: Step[] = [
    {
      key: "account",
      title: "Account created",
      state: "done",
      label: "Done",
      detail: "Your creator application is on file.",
    },
    {
      key: "email",
      title: "Email verification",
      state: emailVerified ? "done" : "action",
      label: emailVerified ? "Verified" : "Check your inbox",
      detail: emailVerified
        ? "Your email address is confirmed."
        : "We sent you a link — open it on any device to confirm your email.",
    },
    {
      key: "identity",
      title: "Identity & age verification",
      state: identityDone ? "done" : status === "VERIFICATION_REQUIRED" ? "action" : "upcoming",
      label: identityDone ? "Submitted" : status === "VERIFICATION_REQUIRED" ? "Action needed" : "Up next",
      detail: identityDone
        ? "Your ID and liveness check are with our team."
        : "A quick ID, age and liveness check — required for every creator, never shown publicly.",
    },
    {
      key: "review",
      title: "Creator review",
      state: identityDone ? "waiting" : "upcoming",
      label: identityDone ? "In review" : "Pending",
      detail: identityDone
        ? "We're reviewing your application. You'll be able to publish as soon as you're approved."
        : "Starts automatically once your verification is submitted.",
    },
  ];
  const doneCount = steps.filter((s) => s.state === "done").length;

  const nextStep = !emailVerified
    ? "Confirm your email, then complete your identity verification below."
    : status === "VERIFICATION_REQUIRED"
      ? "Complete your identity verification — it only takes a few minutes."
      : status === "UNDER_REVIEW"
        ? "Nothing for now. Set up your profile while we review your application."
        : "Your application is being processed.";

  async function resendEmail() {
    setResend("sending");
    setResendError(null);
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
    if (res.ok) {
      setResend("sent");
      return;
    }
    const body = await res.json().catch(() => null);
    setResendError(typeof body?.error === "string" ? body.error : "Couldn't send the email. Try again shortly.");
    setResend("error");
  }

  return (
    <motion.section
      style={panelStyle}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.standard}
      aria-labelledby="creator-onboarding-heading"
    >
      <div style={headerStyle}>
        <span style={eyebrowStyle}>Creator account</span>
        <h2 id="creator-onboarding-heading" style={headingStyle}>
          {displayName ? `You're in, ${displayName}` : "You're in"}
        </h2>
        <p style={subStyle}>Everything is on track. Here&apos;s exactly where your account stands.</p>
        <div style={progressTrackStyle} role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
          <motion.div
            style={progressFillStyle}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${(doneCount / steps.length) * 100}%` }}
            transition={transitions.large}
          />
        </div>
        <span style={progressLabelStyle}>
          {doneCount} of {steps.length} complete
        </span>
      </div>

      <ol style={stepListStyle}>
        {steps.map((step) => (
          <li key={step.key} style={stepRowStyle}>
            <StepIcon state={step.state} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={stepTitleRowStyle}>
                <span style={stepTitleStyle}>{step.title}</span>
                <span style={stepBadgeStyle(step.state)}>{step.label}</span>
              </div>
              <p style={stepDetailStyle}>{step.detail}</p>

              {step.key === "email" && !emailVerified && (
                <div style={{ marginTop: "0.5rem" }}>
                  {resend === "sent" ? (
                    <span style={{ fontSize: "0.8rem", color: "var(--success)" }}>✓ Sent — check your inbox and spam folder.</span>
                  ) : (
                    <button type="button" onClick={resendEmail} disabled={resend === "sending"} style={linkButtonStyle}>
                      {resend === "sending" ? "Sending…" : "Resend verification email"}
                    </button>
                  )}
                  {resendError && <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "0.3rem" }}>{resendError}</div>}
                </div>
              )}

              {step.key === "identity" && status === "VERIFICATION_REQUIRED" && (
                <div style={{ marginTop: "0.6rem" }}>
                  <button type="button" onClick={() => setVerifyOpen((v) => !v)} style={primaryPillStyle} aria-expanded={verifyOpen}>
                    {verifyOpen ? "Hide verification" : "Start verification"}
                  </button>
                  <AnimatePresence initial={false}>
                    {verifyOpen && (
                      <motion.div
                        key="verify"
                        initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={transitions.standard}
                        style={{ overflow: "hidden" }}
                      >
                        <VerificationFlow />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div style={nextStepStyle}>
        <span style={nextStepLabelStyle}>Next step</span>
        <span>{nextStep}</span>
      </div>

      <div style={unlockGridStyle}>
        <div style={unlockCardStyle}>
          <span style={unlockHeadingStyle}>Available now</span>
          <ul style={unlockListStyle}>
            <li>Set up your profile picture, bio and featured image</li>
            <li>Upload content as soon as your verification is submitted</li>
            <li>Browse the Timeline and message fans</li>
          </ul>
        </div>
        <div style={unlockCardStyle}>
          <span style={{ ...unlockHeadingStyle, color: "var(--text-muted)" }}>Unlocks after approval</span>
          <ul style={unlockListStyle}>
            <li>Your verified badge and monetised VIP &amp; Exclusive content</li>
            <li>Appearing in Discover and fans&apos; Timelines</li>
            <li>Earning from subscriptions, with payouts to you</li>
          </ul>
        </div>
      </div>
    </motion.section>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span style={{ ...iconBaseStyle, background: "var(--success)", color: "var(--bg)" }} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "action") {
    return <span style={{ ...iconBaseStyle, border: "2px solid var(--accent)", background: "var(--accent-soft)" }} aria-hidden="true" />;
  }
  if (state === "waiting") {
    return (
      <span style={{ ...iconBaseStyle, border: "2px solid var(--accent)" }} aria-hidden="true">
        <span className="onboarding-pulse" style={pulseDotStyle} />
      </span>
    );
  }
  return <span style={{ ...iconBaseStyle, border: "2px solid var(--border)" }} aria-hidden="true" />;
}

const panelStyle: React.CSSProperties = {
  textAlign: "left",
  background: "var(--surface)",
  borderRadius: "20px",
  boxShadow: "var(--glow)",
  padding: "1.5rem",
  marginBottom: "2rem",
};

const headerStyle: React.CSSProperties = { marginBottom: "1.25rem" };

const eyebrowStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.35rem",
  fontWeight: 600,
  margin: "0.35rem 0 0.25rem",
};

const subStyle: React.CSSProperties = { color: "var(--text-muted)", fontSize: "0.9rem", margin: "0 0 1rem" };

const progressTrackStyle: React.CSSProperties = {
  height: "6px",
  borderRadius: "999px",
  background: "var(--surface-raised)",
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--accent), var(--success))",
};

const progressLabelStyle: React.CSSProperties = {
  display: "block",
  marginTop: "0.45rem",
  fontSize: "0.75rem",
  color: "var(--text-muted)",
};

const stepListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "1.1rem",
};

const stepRowStyle: React.CSSProperties = { display: "flex", gap: "0.85rem", alignItems: "flex-start" };

const iconBaseStyle: React.CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
};

const pulseDotStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: "var(--accent)",
};

const stepTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const stepTitleStyle: React.CSSProperties = { fontWeight: 600, fontSize: "0.95rem" };

function stepBadgeStyle(state: StepState): React.CSSProperties {
  const color =
    state === "done" ? "var(--success)" : state === "action" || state === "waiting" ? "var(--accent)" : "var(--text-muted)";
  return {
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color,
    border: `1px solid ${color}`,
    borderRadius: "999px",
    padding: "0.15rem 0.6rem",
    whiteSpace: "nowrap",
  };
}

const stepDetailStyle: React.CSSProperties = { margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 };

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "var(--accent)",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};

const primaryPillStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: "999px",
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
  minHeight: "40px",
};

const nextStepStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  marginTop: "1.5rem",
  padding: "0.9rem 1rem",
  borderRadius: "var(--radius)",
  background: "var(--accent-soft)",
  fontSize: "0.9rem",
};

const nextStepLabelStyle: React.CSSProperties = { ...eyebrowStyle, fontSize: "0.68rem" };

const unlockGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.75rem",
  marginTop: "1rem",
};

const unlockCardStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  borderRadius: "var(--radius)",
  padding: "0.9rem 1rem",
};

const unlockHeadingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--success)",
};

const unlockListStyle: React.CSSProperties = {
  margin: "0.5rem 0 0",
  paddingLeft: "1.1rem",
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  lineHeight: 1.7,
};
