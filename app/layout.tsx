import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Kasma",
    template: "%s · Kasma",
  },
  description:
    "Multi-bank financial control platform — monitor balances, process statements, and catch financial errors without a bank API.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
