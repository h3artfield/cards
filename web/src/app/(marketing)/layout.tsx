import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Card Scanner 9000 — Faster card shop buyback processing",
  description:
    "Card Scanner 9000 helps trading card stores scan, identify, price, and review customer buyback orders faster.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
