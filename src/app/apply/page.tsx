"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/ui";
import {
  pageWrapStyle,
  cardStyle,
  displayHeadingStyle,
  Field,
  inputStyle,
  checkboxRowStyle,
  primaryButtonStyle,
  errorBannerStyle,
  ImageUploadField,
} from "@/components/ui";

const STATUS_COPY: Record<string, string> = {
  PENDING: "Application received.",
  VERIFICATION_REQUIRED: "Awaiting identity, age, and liveness verification.",
  UNDER_REVIEW: "Verification complete — awaiting admin approval.",
  VERIFIED: "You're a Verified baddie.",
  SUSPENDED: "Your creator account is suspended.",
  REJECTED: "Your application was not approved.",
  BANNED: "Your creator account has been banned.",
};

export default function ApplyPage() {
  const router = useRouter();
  const { user, loading } = useSession();

  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [agreesToCreatorAgreement, setAgreesToCreatorAgreement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ status: string } | null>(null);

  if (loading) {
    return <main style={pageWrapStyle} />;
  }

  if (!user) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
        <p style={{ color: "var(--text-muted)" }}>
          You need an account before applying to become a creator.
        </p>
      </main>
    );
  }

  const existingStatus = submitted?.status ?? user.creatorProfile?.status;
  if (existingStatus) {
    return (
      <main style={pageWrapStyle}>
        <h1 style={displayHeadingStyle}>Creator application</h1>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: "0.95rem" }}>
            <strong>Status:</strong> {existingStatus}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.6rem" }}>
            {STATUS_COPY[existingStatus] ?? "Application on file."}
          </p>
        </div>
        {existingStatus === "VERIFICATION_REQUIRED" && <SelfieCapture />}
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/creator/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        legalName,
        bio: bio || undefined,
        avatarUrl: avatarUrl || undefined,
        featuredImageUrl: featuredImageUrl || undefined,
        confirmsAdult,
        agreesToCreatorAgreement,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }

    const body = await res.json();
    setSubmitted({ status: body.status });
    router.refresh();
  }

  return (
    <main style={pageWrapStyle}>
      <h1 style={displayHeadingStyle}>Apply to become a creator</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "0.5rem", fontSize: "0.92rem" }}>
        Your legal name is encrypted and never shown publicly. Your stage name is what fans see.
      </p>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.75rem", fontSize: "0.92rem" }}>
        Open to South African creators only, no exceptions — this is checked automatically when
        you submit.
      </p>
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          {error && <div style={errorBannerStyle}>{error}</div>}

          <Field label="Stage name" hint="What fans will see on your profile.">
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={50}
              required
            />
          </Field>

          <Field label="Legal name" hint="Private. Encrypted at rest. Never shown publicly.">
            <input
              style={inputStyle}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </Field>

          <Field label="Bio" hint="Optional.">
            <textarea
              style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={2000}
            />
          </Field>

          <ImageUploadField
            label="Profile picture"
            hint="Optional now — you can add or change this later in Settings."
            value={avatarUrl}
            onChange={setAvatarUrl}
          />

          <ImageUploadField
            label="Featured image"
            hint="What shows on The Baddest, baddies near you, and other discovery cards. Optional now — add or change it later from your Dashboard's Content tab. Keep it non-explicit."
            value={featuredImageUrl}
            onChange={setFeaturedImageUrl}
            shape="rect"
          />

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={confirmsAdult}
              onChange={(e) => setConfirmsAdult(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I confirm I am 18 years of age or older.
          </label>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={agreesToCreatorAgreement}
              onChange={(e) => setAgreesToCreatorAgreement(e.target.checked)}
              required
              style={{ marginTop: "0.15rem" }}
            />
            I accept the Creator Agreement.
          </label>

          <button type="submit" style={primaryButtonStyle} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        </form>
      </div>
    </main>
  );
}

function formatError(body: unknown): string {
  if (!body || typeof body !== "object") return "Something went wrong. Please try again.";
  const err = (body as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "fieldErrors" in err) {
    const fieldErrors = (err as { fieldErrors: Record<string, string[]> }).fieldErrors;
    const first = Object.values(fieldErrors).flat().find(Boolean);
    if (first) return first;
  }
  return "Something went wrong. Please try again.";
}

type CapturePhase = "checking" | "live" | "review" | "submitted";

/**
 * Live in-browser capture of a selfie holding ID for the
 * VERIFICATION_REQUIRED step — getUserMedia + canvas, never a file
 * picker (product decision: "not upload but capture within the site").
 * One captured frame is submitted as evidence for identity, age, and
 * liveness together (see POST /api/creator/verification/capture); a
 * human admin reviews it afterward — this UI never claims the creator is
 * verified on its own.
 */
function SelfieCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<CapturePhase>("checking");
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creator/verification/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { checks?: Record<string, string> } | null) => {
        if (cancelled) return;
        const livenessCheck = body?.checks?.LIVENESS;
        setPhase(livenessCheck === "MANUAL_REVIEW" || livenessCheck === "PASSED" ? "submitted" : "live");
      })
      .catch(() => {
        if (!cancelled) setPhase("live");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (phase !== "live") return;
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
          setError(
            "Camera access is required to verify your identity. Please allow camera permission and reload the page."
          );
        }
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [phase]);

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
    setPhase("review");
  }

  function handleRetake() {
    setCaptured(null);
    setError(null);
    setPhase("live");
  }

  async function handleSubmit() {
    if (!captured) return;
    setSubmitting(true);
    setError(null);
    const base64Data = captured.slice(captured.indexOf(",") + 1);
    const res = await fetch("/api/creator/verification/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: "image/jpeg", base64Data }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(formatError(body));
      return;
    }
    setPhase("submitted");
  }

  if (phase === "checking") return null;

  if (phase === "submitted") {
    return (
      <div style={{ ...cardStyle, marginTop: "1rem" }}>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Your selfie holding your ID has been submitted and is awaiting manual review.
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, marginTop: "1rem" }}>
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Verify your identity</h3>
      <p style={{ margin: "0 0 0.8rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
        Hold your ID next to your face — make sure both are clearly visible. This is captured live
        with your camera; uploading a photo isn&apos;t supported.
      </p>
      {error && <div style={errorBannerStyle}>{error}</div>}
      {phase === "live" && !error && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={captureMediaStyle}
          />
          <div style={{ marginTop: "0.8rem" }}>
            <button type="button" onClick={handleCapture} style={{ ...primaryButtonStyle, width: "auto" }}>
              Capture
            </button>
          </div>
        </>
      )}
      {phase === "review" && captured && (
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
            <button type="button" onClick={handleRetake} style={retakeButtonStyle} disabled={submitting}>
              Retake
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

const retakeButtonStyle: React.CSSProperties = {
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
