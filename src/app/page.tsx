/**
 * Sprint 0 placeholder landing page. The real age-gate UI (§5) and
 * marketing/discovery experience land in Sprint 3. This route exists so
 * the app boots and the shell/routing structure is provable end-to-end.
 */
export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "4rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Baddies</h1>
      <p>Safe. Verified. Affordable. Adult-only.</p>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        18+ platform. Full age-gate and discovery experience ship in later sprints — this is the
        Sprint 0 foundation shell.
      </p>
    </main>
  );
}
