"use client";

import { useSearchParams } from "next/navigation";
import { AdminPricingContent } from "./AdminPricingContent";

const VALID = new Set(["rules", "buy", "conditions", "providers"]);

export function AdminPricingPageInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("section") ?? "rules";
  const initialSection = VALID.has(raw)
    ? (raw as "rules" | "buy" | "conditions" | "providers")
    : "rules";

  return <AdminPricingContent initialSection={initialSection} />;
}
