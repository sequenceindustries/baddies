import type { Metadata } from "next";
import LandingPage from "./landing-page";

// Server wrapper so the homepage can carry its own title, description
// and canonical (the landing UI itself is a client component).
export const metadata: Metadata = {
  title: "baddies — Africa's verified adult creator network",
  description:
    "Verified South African creators publishing exclusive content, paid directly by the fans who support them. Free previews, VIP Pass from $3.50/month (3, 6 or 12 months), Exclusive subscriptions $10/month. 18+ only.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <LandingPage />;
}
