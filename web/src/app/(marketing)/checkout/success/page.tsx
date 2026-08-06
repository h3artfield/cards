import { Suspense } from "react";
import { CheckoutSuccessContent } from "@/components/marketing/CheckoutSuccessContent";

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-slate-600">
          Loading…
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}
