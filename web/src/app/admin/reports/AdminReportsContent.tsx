"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { Button } from "@/components/Button";
import { StoreStrategicReportView } from "@/components/StoreStrategicReportView";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type { StoreStrategicReport } from "@/lib/reports/store-strategic-report";
import { ReportsCustomersSection } from "./ReportsCustomersSection";
import { ReportsInventorySection } from "./ReportsInventorySection";
import { ReportsShippingSection } from "./ReportsShippingSection";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "customers", label: "Customers" },
  { id: "inventory", label: "Inventory" },
  { id: "shipping", label: "Shipping" },
] as const;

export type ReportSectionId = (typeof SECTIONS)[number]["id"];

type InventoryView = "stock" | "sold" | "purchases";

export function AdminReportsContent({
  initialSection = "overview",
  initialInventoryView = "stock",
}: {
  initialSection?: ReportSectionId;
  initialInventoryView?: InventoryView;
}) {
  const { activeStore, loading: authLoading } = useAdmin();
  const router = useRouter();
  const [section, setSection] = useState<ReportSectionId>(initialSection);
  const [report, setReport] = useState<StoreStrategicReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  function goToSection(next: ReportSectionId, view?: InventoryView) {
    setSection(next);
    const params = new URLSearchParams({ section: next });
    if (next === "inventory" && view && view !== "stock") {
      params.set("view", view);
    }
    router.replace(`/admin/reports?${params.toString()}`, { scroll: false });
  }

  async function generateReport() {
    setGenerating(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/reports", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate report");
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  if (authLoading) {
    return (
      <AdminLayout>
        <p className="text-slate-500">Loading…</p>
      </AdminLayout>
    );
  }

  if (!activeStore) {
    return (
      <AdminLayout showStoreTabs={false}>
        <p className="text-slate-600">Select a store to view reports.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Reports</h2>
        <p className="mt-1 text-sm text-slate-600">
          {activeStore.storeName} — strategic overview, customers, inventory, and shipping.
        </p>
      </div>

      <div className="mt-4">
        <AdminSectionTabs
          sections={[...SECTIONS]}
          active={section}
          onChange={(id) => goToSection(id as ReportSectionId)}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {section === "overview" && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Buying trends, purchases, rules, and pipeline insights.
            </p>
            <Button onClick={() => void generateReport()} disabled={generating}>
              {generating ? "Generating…" : "Generate report"}
            </Button>
          </div>

          {!report && !generating && !error && (
            <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
              <p className="text-lg font-medium text-slate-800">No report yet</p>
              <p className="mt-2 text-sm text-slate-600">
                Click Generate report for strategic insights. Per-card buyback reports
                are on each order.
              </p>
            </div>
          )}

          {generating && !report && (
            <p className="mt-8 text-center text-slate-500">Building your store report…</p>
          )}

          {report && <StoreStrategicReportView report={report} />}
        </div>
      )}

      {section === "customers" && (
        <div className="mt-6">
          <h3 className="font-semibold text-slate-800">Customer report</h3>
          <ReportsCustomersSection />
        </div>
      )}

      {section === "inventory" && (
        <div className="mt-6">
          <h3 className="font-semibold text-slate-800">Inventory report</h3>
          <ReportsInventorySection
            initialView={initialInventoryView}
            onViewChange={(view) => goToSection("inventory", view)}
          />
        </div>
      )}

      {section === "shipping" && (
        <div className="mt-6">
          <h3 className="font-semibold text-slate-800">Shipping</h3>
          <ReportsShippingSection />
        </div>
      )}
    </AdminLayout>
  );
}
