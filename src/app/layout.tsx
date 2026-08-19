import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/ui";
import { AgeGate } from "@/components/age-gate";

export const metadata: Metadata = {
  title: "baddies",
  description: "Verified. Safe. Adult creator marketplace. 18+ only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AgeGate>
          <Nav />
          {children}
        </AgeGate>
      </body>
    </html>
  );
}
