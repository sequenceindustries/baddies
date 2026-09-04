"use client";

import { useEffect, useState } from "react";

/**
 * The "verify & upload" step shown right after a successful application
 * submission, AND reused as the resume path when someone arrives later
 * via the emailed verification link (see /founding-baddies/verify-email)
 * — same component, same three sub-steps (email, WhatsApp, identity +
 * documents), driven by GET /api/founding/apply/[id]/status so it always
 * reflects the real current state rather than assuming a fresh
 * application. No account/login exists for a Founding Baddie yet — see
 * the plan's "resumability" note — so this status fetch, keyed only by
 * the unguessable applicationId, is the whole mechanism.
 */
export default function ApplicationNextSteps({
  applicationId,
  whatsappLink: initialWhatsappLink,
}: {
  applicationId: string;
  whatsappLink?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [identitySubmitted, setIdentitySubmitted] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(initialWhatsappLink ?? null);

  function reloadStatus() {
    setLoading(true);
    fetch(`/api/founding/apply/${applicationId}/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (body: {
          emailVerified?: boolean;
          whatsappVerified?: boolean;
          identitySubmitted?: boolean;
          whatsappLink?: string;
        } | null) => {
          if (!body) return;
          setEmailVerified(body.emailVerified ?? false);
          setWhatsappVerified(body.whatsappVerified ?? false);
          setIdentitySubmitted(body.identitySubmitted ?? false);
          if (body.whatsappLink) setWhatsappLink(body.whatsappLink);
        }
      )
      .finally(() => setLoading(false));
  }

  useEffect(reloadStatus, [applicationId]);

  return (
    <div style={nextStepsWrapStyle}>
      <h3 style={nextStepsHeadingStyle}>Two more things speed up your review</h3>

      <div style={stepCardStyle}>
        <StepStatus done={emailVerified} label="Verify your email" />
        {!emailVerified && (
          <p style={stepHintStyle}>
            {loading ? "Checking…" : "We've emailed you a verification link — click it to confirm your email."}
          </p>
        )}
      </div>

      <div style={stepCardStyle}>
        <StepStatus done={whatsappVerified} label="Confirm on WhatsApp" />
        {!whatsappVerified && whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noreferrer" style={whatsappButtonStyle}>
            Message us on WhatsApp
          </a>
        )}
      </div>

      <div style={stepCardStyle}>
        <StepStatus done={identitySubmitted} label="Identity & ID document" />
        {!identitySubmitted && !loading && (
          <IdentityForm applicationId={applicationId} onSubmitted={reloadStatus} />
        )}
        {identitySubmitted && (
          <p style={stepHintStyle}>Submitted — our team will review it as part of your application.</p>
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

function IdentityForm({ applicationId, onSubmitted }: { applicationId: string; onSubmitted: () => void }) {
  const [legalName, setLegalName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idHoldingPhoto, setIdHoldingPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!idDocument || !selfie) {
      setError("An ID document and a verification selfie are both required.");
      return;
    }

    setSubmitting(true);
    try {
      const documents = await Promise.all(
        [
          { type: "ID_DOCUMENT" as const, file: idDocument },
          { type: "SELFIE" as const, file: selfie },
          ...(idHoldingPhoto ? [{ type: "ID_HOLDING_PHOTO" as const, file: idHoldingPhoto }] : []),
        ].map(async (d) => ({
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
        placeholder="Legal name"
        value={legalName}
        onChange={(e) => setLegalName(e.target.value)}
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
        placeholder="Nationality"
        value={nationality}
        onChange={(e) => setNationality(e.target.value)}
        style={identityInputStyle}
        required
      />
      <input
        type="text"
        placeholder="ID / passport number"
        value={idNumber}
        onChange={(e) => setIdNumber(e.target.value)}
        style={identityInputStyle}
        required
      />
      <label style={fileLabelStyle}>
        ID document (required)
        <input type="file" accept="image/*" onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)} required />
      </label>
      <label style={fileLabelStyle}>
        Verification selfie (required)
        <input type="file" accept="image/*" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} required />
      </label>
      <label style={fileLabelStyle}>
        Photo holding your ID (optional, may be requested later if not provided now)
        <input type="file" accept="image/*" onChange={(e) => setIdHoldingPhoto(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p style={identityErrorStyle}>{error}</p>}
      <button type="submit" disabled={submitting} style={identitySubmitStyle}>
        {submitting ? "Uploading…" : "Submit for review"}
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
const whatsappButtonStyle: React.CSSProperties = { display: "inline-block", marginTop: "0.6rem", padding: "0.5rem 1rem", borderRadius: "8px", background: "#25D366", color: "#0b0b0b", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none" };
const identityFormStyle: React.CSSProperties = { marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem" };
const identityInputStyle: React.CSSProperties = { padding: "0.55rem 0.7rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.9rem" };
const fileLabelStyle: React.CSSProperties = { fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.3rem" };
const identityErrorStyle: React.CSSProperties = { fontSize: "0.85rem", color: "var(--danger)", margin: 0 };
const identitySubmitStyle: React.CSSProperties = { padding: "0.6rem 1.2rem", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", alignSelf: "flex-start" };
