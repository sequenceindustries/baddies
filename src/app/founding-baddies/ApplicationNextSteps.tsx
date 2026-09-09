"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The "verify & upload" step shown right after a successful application
 * submission, AND reused as the resume path when someone arrives later
 * via the emailed verification link (see /founding-baddies/verify-email)
 * — same component, same two sub-steps (email, identity + document),
 * driven by GET /api/founding/apply/[id]/status so it always reflects
 * the real current state rather than assuming a fresh application. No
 * account/login exists for a Founding Baddie yet — see the plan's
 * "resumability" note — so this status fetch, keyed only by the
 * unguessable applicationId, is the whole mechanism.
 *
 * WhatsApp confirmation is no longer a step shown here — it's dropped
 * from the applicant-facing flow entirely (per explicit request), not
 * from the platform: CONTACT_CONFIRMED stays a real
 * FoundingApplicationStatus stage admin can still reach via its own
 * confirm-whatsapp action, and advanceFoundingStatus already treats it
 * as informational rather than a gate on anything else (see that
 * module's own comment) — nothing here or on the admin side depended on
 * an applicant seeing this step.
 */
export default function ApplicationNextSteps({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [identitySubmitted, setIdentitySubmitted] = useState(false);

  function reloadStatus() {
    setLoading(true);
    fetch(`/api/founding/apply/${applicationId}/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { emailVerified?: boolean; identitySubmitted?: boolean } | null) => {
        if (!body) return;
        setEmailVerified(body.emailVerified ?? false);
        setIdentitySubmitted(body.identitySubmitted ?? false);
      })
      .finally(() => setLoading(false));
  }

  useEffect(reloadStatus, [applicationId]);

  return (
    <div style={nextStepsWrapStyle}>
      <h3 style={nextStepsHeadingStyle}>One more thing speeds up your review</h3>

      <div style={stepCardStyle}>
        <StepStatus done={emailVerified} label="Verify your email" />
        {!emailVerified && (
          <p style={stepHintStyle}>
            {loading ? "Checking…" : "We've emailed you a verification link — click it to confirm your email."}
          </p>
        )}
      </div>

      <div style={stepCardStyle}>
        <StepStatus done={identitySubmitted} label="Identity & ID document" />
        {identitySubmitted ? (
          <p style={stepHintStyle}>Submitted — our team will review it as part of your application.</p>
        ) : !loading && !emailVerified ? (
          // Locked, not just listed second — per explicit product
          // decision, an applicant can't get ahead of the pipeline by
          // skipping straight to identity before confirming their
          // email. POST /api/founding/apply/[id]/identity enforces the
          // same rule server-side, so this isn't just a UI suggestion.
          <p style={stepHintStyle}>Verify your email above first, then you can submit your ID.</p>
        ) : (
          !loading && <IdentityForm applicationId={applicationId} onSubmitted={reloadStatus} />
        )}
      </div>
    </div>
  );
}

function StepStatus({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={stepStatusRowStyle}>
      <span style={{ ...stepBadgeStyle, ...(done ? stepBadgeDoneStyle : undefined) }}>{done ? "✓" : "○"}</span>
      <span style={stepLabelStyle}>{label}</span>
    </div>
  );
}

/**
 * Reads a South African 13-digit ID number's first 6 digits (YYMMDD) and
 * returns the birthdate as "YYYY-MM-DD" for the date input above, or
 * null if those digits don't form a real calendar date (a passport
 * number, a still-incomplete ID number mid-typing, etc.) — the century
 * itself isn't encoded in the number, so this uses the same two-digit-
 * year heuristic every SA ID parser does: a YY greater than the current
 * two-digit year is assumed to be 19XX, otherwise 20XX. It's an assist,
 * not a source of truth — the date field stays editable so an applicant
 * can correct it if the guess lands on the wrong century.
 */
export function parseSaIdDateOfBirth(idNumber: string): string | null {
  const digits = idNumber.replace(/\s/g, "");
  if (!/^\d{13}$/.test(digits)) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12) return null;

  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const year = century + yy;

  const parsed = new Date(Date.UTC(year, mm - 1, dd));
  const isRealDate =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === mm - 1 && parsed.getUTCDate() === dd;
  if (!isRealDate) return null;

  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function IdentityForm({ applicationId, onSubmitted }: { applicationId: string; onSubmitted: () => void }) {
  const router = useRouter();
  const [legalName, setLegalName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleIdNumberChange(value: string) {
    setIdNumber(value);
    const parsedDob = parseSaIdDateOfBirth(value);
    if (parsedDob) setDateOfBirth(parsedDob);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!idDocument) {
      setError("An ID document is required.");
      return;
    }

    setSubmitting(true);
    try {
      const documents = await Promise.all(
        [{ type: "ID_DOCUMENT" as const, file: idDocument }].map(async (d) => ({
          type: d.type,
          mimeType: d.file.type,
          base64Data: await fileToBase64(d.file),
        }))
      );

      const res = await fetch(`/api/founding/apply/${applicationId}/identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalName, dateOfBirth, nationality, idNumber, documents }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.");
        return;
      }

      onSubmitted();
      // Head straight to the applicant's own status dashboard instead of
      // staying on whichever page this form happened to be reached from
      // (the original application page, or the emailed verify-email
      // link) — one canonical place to check progress from here on,
      // reachable again any time via the same unguessable id.
      router.push(`/founding-baddies/dashboard?id=${applicationId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={identityFormStyle}>
      <p style={stepHintStyle}>
        Private — encrypted at rest, never shown publicly. Documents are stored securely and only
        reviewed by our verification team.
      </p>
      <input
        type="text"
        placeholder="ID / passport number"
        value={idNumber}
        onChange={(e) => handleIdNumberChange(e.target.value)}
        style={identityInputStyle}
        required
      />
      <input
        type="date"
        placeholder="Date of birth"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        style={identityInputStyle}
        required
      />
      <input
        type="text"
        placeholder="Legal name"
        value={legalName}
        onChange={(e) => setLegalName(e.target.value)}
        style={identityInputStyle}
        required
      />
      <input
        type="text"
        placeholder="Nationality"
        value={nationality}
        onChange={(e) => setNationality(e.target.value)}
        style={identityInputStyle}
        required
      />
      <div style={fileFieldWrapStyle}>
        <span style={fileFieldLabelStyle}>ID document (required)</span>
        <div style={fileFieldRowStyle}>
          <label style={fileUploadButtonStyle}>
            {idDocument ? "Change file" : "Choose file"}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)}
              required
              style={hiddenFileInputStyle}
            />
          </label>
          <span style={fileNameStyle}>{idDocument ? idDocument.name : "No file chosen"}</span>
        </div>
      </div>
      {error && <p style={identityErrorStyle}>{error}</p>}
      <button type="submit" disabled={submitting} style={identitySubmitStyle}>
        {submitting ? "Uploading…" : "Submit"}
      </button>
    </form>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const nextStepsWrapStyle: React.CSSProperties = { marginTop: "1.5rem" };
const nextStepsHeadingStyle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 500, margin: "0 0 0.9rem" };
const stepCardStyle: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem 1.2rem", marginBottom: "0.8rem" };
const stepStatusRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.6rem" };
const stepBadgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "50%", border: "1px solid var(--border)", fontSize: "0.8rem", color: "var(--text-muted)" };
const stepBadgeDoneStyle: React.CSSProperties = { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" };
const stepLabelStyle: React.CSSProperties = { fontWeight: 500 };
const stepHintStyle: React.CSSProperties = { fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.5rem 0 0" };
const identityFormStyle: React.CSSProperties = { marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem" };
const identityInputStyle: React.CSSProperties = { padding: "0.55rem 0.7rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.9rem" };
const fileFieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.4rem" };
const fileFieldLabelStyle: React.CSSProperties = { fontSize: "0.85rem", color: "var(--text-muted)" };
const fileFieldRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap" };
// Same ghost-accent-button treatment as the rest of the app's secondary
// controls (e.g. LocationField's "Detect my location" in components/ui.tsx)
// — a real button, not the browser's own unstyled file-input chrome.
const fileUploadButtonStyle: React.CSSProperties = { display: "inline-block", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--accent)", color: "var(--accent)", background: "transparent", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", flexShrink: 0 };
const hiddenFileInputStyle: React.CSSProperties = { display: "none" };
const fileNameStyle: React.CSSProperties = { fontSize: "0.82rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" };
const identityErrorStyle: React.CSSProperties = { fontSize: "0.85rem", color: "var(--danger)", margin: 0 };
const identitySubmitStyle: React.CSSProperties = { padding: "0.6rem 1.2rem", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", alignSelf: "flex-start" };
