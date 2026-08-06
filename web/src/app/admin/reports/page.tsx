import { Suspense } from "react";
import { AdminReportsPageInner } from "./AdminReportsPageInner";

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">Loading reports…</p>}>
      <AdminReportsPageInner />
    </Suspense>
  );
}
