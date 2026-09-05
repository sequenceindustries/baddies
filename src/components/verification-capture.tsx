"use client";

import { useEffect, useRef, useState } from "react";
import { cardStyle, Field, inputStyle, primaryButtonStyle, errorBannerStyle, ImageUploadField } from "@/components/ui";

type CheckState = "NOT_STARTED" | "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "EXPIRED" | "MANUAL_REVIEW";
type StepStatus = "locked" | "todo" | "submitted" | "passed" | "failed";

interface StatusResponse {
  detailsSubmitted: boolean;
  checks: Partial<Record<"IDENTITY" | "AGE" | "LIVENESS", CheckState>>;
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  return { mimeType: match?.[1] ?? "application/octet-stream", base64Data: match?.[2] ?? "" };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).slice((reader.result as string).indexOf(",") + 1));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * The full 3-step real creator verification wizard — used on both
 * /apply's VERIFICATION_REQUIRED screen and creator-dashboard's
 * StatusPanel, so the flow only exists once:
 *   1. Details + ID document (a regular form + regular upload).
 *   2. Identity + Age: a live selfie-holding-ID photo (camera capture,
 *      never a file picker).
 *   3. Liveness: a required, live-recorded selfie video.
 * Each step unlocks only once the previous one is submitted. A FAILED
 * admin review reopens steps 1+2 (the "identity+age" group) or step 3
 * (liveness) for resubmission — see the capture/identity-details routes,
 * which upsert in place rather than accumulating rows.
 */
export function VerificationFlow() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  function reload() {
    fetch("/api/creator/verification/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setStatus(body ?? { detailsSubmitted: false, checks: {} }));
  }

  useEffect(reload, []);

  if (!status) return null;

  const identityAge: CheckState = status.checks.IDENTITY ?? "NOT_STARTED";
  const liveness: CheckState = status.checks.LIVENESS ?? "NOT_STARTED";

  const step1: StepStatus = identityAge === "FAILED" ? "failed" : status.detailsSubmitted ? "submitted" : "todo";
  const step2: StepStatus = !status.detailsSubmitted
    ? "locked"
    : identityAge === "FAILED"
      ? "failed"
      : identityAge === "PASSED"
        ? "passed"
        : identityAge === "MANUAL_REVIEW"
          ? "submitted"
          : "todo";
  const step2Done = step2 === "submitted" || step2 === "passed";
  const step3: StepStatus = !step2Done
    ? "locked"
    : liveness === "FAILED"
      ? "failed"
      : liveness === "PASSED"
        ? "passed"
        : liveness === "MANUAL_REVIEW"
          ? "submitted"
          : "todo";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
      <StepDetails status={step1} onSubmitted={reload} />
      <StepIdentityAge status={step2} onSubmitted={reload} />
      <StepLiveness status={step3} onSubmitted={reload} />
    </div>
  );
}

function stepHeadingStyle(): React.CSSProperties {
  return { margin: "0 0 0.5rem", fontSize: "1rem" };
}

function summaryLineStyle(): React.CSSProperties {
  return { margin: 0, fontSize: "0.9rem", color: "var(--text-muted)" };
}

// ---- Step 1: details + ID document (regular form + regular upload) ----

function StepDetails({ status, onSubmitted }: { status: StepStatus; onSubmitted: () => void }) {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "submitted" || status === "passed") {
    return (
      <div style={cardStyle}>
        <p style={summaryLineStyle()}>✓ Step 1 — your details and ID document are on file.</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!documentUrl) {
      setError("Upload a photo of your ID document.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const document = parseDataUrl(documentUrl);
    const res = await fetch("/api/creator/verification/identity-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth, nationality, idNumber, document }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error && typeof body.error === "string" ? body.error : "Couldn't submit your details.");
      return;
    }
    onSubmitted();
  }

  return (
    <div style={cardStyle}>
      <h3 style={stepHeadingStyle()}>Step 1 — Your details</h3>
      {status === "failed" && (
        <p style={{ ...summaryLineStyle(), color: "var(--danger)" }}>
          Your previous submission wasn&apos;t accepted — please review and resubmit.
        </p>
      )}
      {error && <div style={errorBannerStyle}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <Field label="Date of birth">
          <input
            type="date"
            style={inputStyle}
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
          />
        </Field>
        <Field label="Nationality">
          <input
            style={inputStyle}
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            minLength={1}
            maxLength={100}
            required
          />
        </Field>
        <Field label="ID / passport number" hint="Encrypted at rest. Never shown publicly.">
          <input
            style={inputStyle}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            minLength={3}
            maxLength={50}
            required
          />
        </Field>
        <ImageUploadField
          label="ID document"
          hint="A clear photo of your government ID or passport."
          value={documentUrl}
          onChange={setDocumentUrl}
          shape="rect"
        />
        <button type="submit" style={primaryButtonStyle} disabled={submitting}>
          {submitting ? "Submitting..." : "Continue"}
        </button>
      </form>
    </div>
  );
}

// ---- Step 2: Identity + Age — live selfie-holding-ID photo ----

function StepIdentityAge({ status, onSubmitted }: { status: StepStatus; onSubmitted: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (!active || captured) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Camera access is required. Please allow camera permission and reload the page.");
        }
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, captured]);

  if (status === "locked") {
    return (
      <div style={{ ...cardStyle, opacity: 0.6 }}>
        <h3 style={stepHeadingStyle()}>Step 2 — Verify identity &amp; age</h3>
        <p style={summaryLineStyle()}>Complete step 1 first.</p>
      </div>
    );
  }
  if (status === "submitted") {
    return (
      <div style={cardStyle}>
        <p style={summaryLineStyle()}>✓ Step 2 — identity &amp; age photo submitted, awaiting review.</p>
      </div>
    );
  }
  if (status === "passed") {
    return (
      <div style={cardStyle}>
        <p style={summaryLineStyle()}>✓ Step 2 — identity &amp; age verified.</p>
      </div>
    );
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL("image/jpeg", 0.85));
    stopStream();
  }

  function handleRetake() {
    setCaptured(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!captured) return;
    setSubmitting(true);
    setError(null);
    const { mimeType, base64Data } = parseDataUrl(captured);
    const res = await fetch("/api/creator/verification/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "IDENTITY_AGE", mimeType, base64Data }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error && typeof body.error === "string" ? body.error : "Couldn't submit your photo.");
      return;
    }
    onSubmitted();
  }

  return (
    <div style={cardStyle}>
      <h3 style={stepHeadingStyle()}>Step 2 — Verify identity &amp; age</h3>
      {status === "failed" && (
        <p style={{ ...summaryLineStyle(), color: "var(--danger)" }}>
          Your previous photo wasn&apos;t accepted — please retake it.
        </p>
      )}
      <p style={{ ...summaryLineStyle(), marginBottom: "0.8rem" }}>
        Hold your ID next to your face — make sure both are clearly visible. This is captured live
        with your camera; uploading a photo isn&apos;t supported.
      </p>
      {error && <div style={errorBannerStyle}>{error}</div>}

      {!active && !captured && (
        <button type="button" onClick={() => setActive(true)} style={{ ...primaryButtonStyle, width: "auto" }}>
          Start
        </button>
      )}

      {active && !captured && !error && (
        <>
          <video ref={videoRef} autoPlay playsInline muted style={captureMediaStyle} />
          <div style={{ marginTop: "0.8rem" }}>
            <button type="button" onClick={handleCapture} style={{ ...primaryButtonStyle, width: "auto" }}>
              Capture
            </button>
          </div>
        </>
      )}

      {captured && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captured} alt="Captured selfie holding ID" style={captureMediaStyle} />
          <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={handleSubmit}
              style={{ ...primaryButtonStyle, width: "auto", flex: 1 }}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button type="button" onClick={handleRetake} style={secondaryButtonStyle} disabled={submitting}>
              Retake
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Step 3: Liveness — required, live-recorded selfie video ----

const RECORD_MS = 6000;

function StepLiveness({ status, onSubmitted }: { status: StepStatus; onSubmitted: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      stopStream();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "locked") {
    return (
      <div style={{ ...cardStyle, opacity: 0.6 }}>
        <h3 style={stepHeadingStyle()}>Step 3 — Liveness video</h3>
        <p style={summaryLineStyle()}>Complete step 2 first.</p>
      </div>
    );
  }
  if (status === "submitted") {
    return (
      <div style={cardStyle}>
        <p style={summaryLineStyle()}>✓ Step 3 — liveness video submitted, awaiting review.</p>
      </div>
    );
  }
  if (status === "passed") {
    return (
      <div style={cardStyle}>
        <p style={summaryLineStyle()}>✓ Step 3 — liveness verified.</p>
      </div>
    );
  }

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    } catch {
      setError("Camera access is required. Please allow camera permission and reload the page.");
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }

    const supportedType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
    );
    const recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      stopStream();
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, RECORD_MS);
  }

  function handleRetake() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!recordedBlob) return;
    setSubmitting(true);
    setError(null);
    const base64Data = await blobToBase64(recordedBlob);
    const res = await fetch("/api/creator/verification/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "LIVENESS", mimeType: recordedBlob.type || "video/webm", base64Data }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error && typeof body.error === "string" ? body.error : "Couldn't submit your video.");
      return;
    }
    onSubmitted();
  }

  return (
    <div style={cardStyle}>
      <h3 style={stepHeadingStyle()}>Step 3 — Liveness video</h3>
      {status === "failed" && (
        <p style={{ ...summaryLineStyle(), color: "var(--danger)" }}>
          Your previous video wasn&apos;t accepted — please record again.
        </p>
      )}
      <p style={{ ...summaryLineStyle(), marginBottom: "0.8rem" }}>
        Record a short (6 second) video of your face. This is recorded live with your camera; a
        real recording is required.
      </p>
      {error && <div style={errorBannerStyle}>{error}</div>}

      {!active && !recordedUrl && (
        <button type="button" onClick={() => setActive(true)} style={{ ...primaryButtonStyle, width: "auto" }}>
          Start
        </button>
      )}

      {active && !recordedUrl && (
        <>
          <video ref={videoRef} autoPlay playsInline muted style={captureMediaStyle} />
          <div style={{ marginTop: "0.8rem" }}>
            <button
              type="button"
              onClick={startRecording}
              style={{ ...primaryButtonStyle, width: "auto" }}
              disabled={recording}
            >
              {recording ? "Recording..." : "Record 6s video"}
            </button>
          </div>
        </>
      )}

      {recordedUrl && (
        <>
          <video src={recordedUrl} controls style={captureMediaStyle} />
          <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={handleSubmit}
              style={{ ...primaryButtonStyle, width: "auto", flex: 1 }}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button type="button" onClick={handleRetake} style={secondaryButtonStyle} disabled={submitting}>
              Record again
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const captureMediaStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  borderRadius: "var(--radius)",
  background: "#000",
  display: "block",
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.8rem",
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontWeight: 600,
  fontSize: "0.95rem",
  cursor: "pointer",
};
