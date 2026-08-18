import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baddies",
  description: "Verified. Safe. Adult creator marketplace. 18+ only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
