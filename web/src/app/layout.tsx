import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CustomerProvider } from "@/context/CustomerContext";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-gray-50 text-gray-900">
        <CustomerProvider>{children}</CustomerProvider>
      </body>
    </html>
  );
}
