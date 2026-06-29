import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Project AVA",
  description: "AI-powered sprint biomechanics analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
