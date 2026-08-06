import { Suspense } from "react";
import { AdminPricingPageInner } from "./AdminPricingPageInner";

export default function AdminPricingPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">Loading pricing…</p>}>
      <AdminPricingPageInner />
    </Suspense>
  );
}
