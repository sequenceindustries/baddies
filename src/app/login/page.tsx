import { LoginForm } from "./login-form";

// Server component so LAUNCH_MODE (not a NEXT_PUBLIC_ var) resolves once
// on the server and reaches the client form as a plain prop — reading
// process.env directly inside a "use client" file works for the initial
// SSR pass but comes back undefined on the browser's own re-run during
// hydration, flipping the rendered link right after paint.
export default function LoginPage() {
  const comingSoon = process.env.LAUNCH_MODE === "coming_soon";
  return <LoginForm comingSoon={comingSoon} />;
}
