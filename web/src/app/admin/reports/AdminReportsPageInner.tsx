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
  const rawDay = searchParams.get("day") ?? "";
  const initialDay = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null;

  return (
    <AdminReportsContent
      initialSection={initialSection}
      initialInventoryView={initialInventoryView}
      initialCustomerId={initialCustomerId}
      startAddOpen={startAddOpen}
      initialDay={initialDay}
    />
  );
}
