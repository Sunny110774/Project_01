import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synopse | Alert operations",
  description: "Email alert triage, SLA tracking, and connected knowledge for resilient operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
