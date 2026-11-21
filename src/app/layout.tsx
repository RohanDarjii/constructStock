import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConstructStock",
  description: "Construction material inventory and waste management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
