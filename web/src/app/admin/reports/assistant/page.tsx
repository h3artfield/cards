"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdmin } from "@/context/AdminContext";
import { ShopReportView } from "@/components/admin/ShopReportView";
import { REPORT_GONE_MESSAGE, parseStoredReport } from "@/lib/shop-assistant/chat-client";
import { readStoredReportText } from "@/lib/shop-assistant/report-storage";

const subscribe = () => () => {};

/**
 * Shows the report the assistant just put together. The chat drawer leaves it
 * under one sessionStorage key and opens this page in a new tab; nothing is
 * fetched and nothing is stored on the server. A report never holds customer
 * data.
 */
export default function AssistantReportPage() {
  // Read on the client only; the server render and first paint show nothing.
  const stored = useSyncExternalStore(subscribe, readStoredReportText, () => null);
  // A report opens only for the person who asked for it. After "Switch user"
  // the next person on this tab gets the "no longer available" message.
  const { staff } = useAdmin();
  const staffId = staff?.staffId ?? null;
  const report = useMemo(() => parseStoredReport(stored, staffId), [stored, staffId]);

  return (
    <AdminLayout>
      <div className="px-4 py-6">
        {report ? (
          <ShopReportView report={report} />
        ) : (
          <p className="mx-auto max-w-4xl rounded-xl border bg-white p-6 text-sm text-slate-600 shadow-sm">
            {REPORT_GONE_MESSAGE}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
