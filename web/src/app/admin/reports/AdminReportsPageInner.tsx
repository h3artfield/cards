"use client";

import { useSearchParams } from "next/navigation";
import { AdminReportsContent, type ReportSectionId } from "./AdminReportsContent";

const SECTIONS = new Set(["overview", "daily", "customers", "inventory", "shipping"]);
const VIEWS = new Set(["stock", "sold", "purchases"]);

export function AdminReportsPageInner() {
  const searchParams = useSearchParams();
  const rawSection = searchParams.get("section") ?? "overview";
  const initialSection: ReportSectionId = SECTIONS.has(rawSection)
    ? (rawSection as ReportSectionId)
    : "overview";

  const rawView = searchParams.get("view") ?? "stock";
  const initialInventoryView = VIEWS.has(rawView)
    ? (rawView as "stock" | "sold" | "purchases")
    : "stock";
  const initialCustomerId = searchParams.get("customer");
  const startAddOpen = searchParams.get("add") === "1";

  return (
    <AdminReportsContent
      initialSection={initialSection}
      initialInventoryView={initialInventoryView}
      initialCustomerId={initialCustomerId}
      startAddOpen={startAddOpen}
    />
  );
}
