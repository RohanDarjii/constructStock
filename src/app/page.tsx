import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "ConstructStock | Construction material inventory, in one place",
  description: "Track purchasing, receiving, stock, consumption, wastage, and transfers across construction sites with ConstructStock.",
};

export default function HomePage() {
  return <LandingPage />;
}
