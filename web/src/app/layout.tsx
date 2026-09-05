import type { Metadata, Viewport } from "next";
import { Cinzel, Geist } from "next/font/google";
import "./globals.css";
import { CustomerProvider } from "@/context/CustomerContext";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Display face for the Professor's MTG surfaces. Magic's own Beleren is
// proprietary; Cinzel is the closest free Trajan revival and carries the same
// inscribed-capital feel. Deliberately paired with Geist rather than a body
// serif: these screens run to 11px data rows, where a serif costs more
// legibility than the theme gains.
const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Card Scanner 9000 — Faster card shop buyback processing",
  description:
    "Card Scanner 9000 helps trading card stores scan, identify, price, and review customer buyback orders faster.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${cinzel.variable} h-full antialiased`}>
      <body className="min-h-full bg-gray-50 text-gray-900">
        <CustomerProvider>{children}</CustomerProvider>
      </body>
    </html>
  );
}
