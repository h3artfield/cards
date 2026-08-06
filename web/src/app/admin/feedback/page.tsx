import { Suspense } from "react";
import { AdminFeedbackContent } from "./AdminFeedbackContent";

export default function AdminFeedbackPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">Loading feedback…</p>}>
      <AdminFeedbackContent />
    </Suspense>
  );
}
