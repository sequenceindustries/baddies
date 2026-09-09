import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/ui";
import { AgeGate } from "@/components/age-gate";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const metadata: Metadata = {
  title: "baddies",
  description: "Verified. Safe. Africa's adult content network. 18+ only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read server-side and passed down as a plain prop rather than checked
  // inside Nav itself — Nav is a client component, and a non-NEXT_PUBLIC_
  // env var like LAUNCH_MODE resolves correctly during SSR but comes back
  // undefined once the same code re-runs in the browser on hydration,
  // which would flip the rendered links right after paint.
  const comingSoon = process.env.LAUNCH_MODE === "coming_soon";
  return (
    <html lang="en">
      <body>
        <AgeGate>
          <Nav comingSoon={comingSoon} />
          {children}
          <BottomTabBar />
        </AgeGate>
      </body>
    </html>
  );
}
