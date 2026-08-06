"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Starts Stripe Checkout for logged-in stores, otherwise sends to signup. */
export default function CheckoutPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/signup");
          return;
        }
        const data = await res.json();
        if (data.session?.role !== "store") {
          router.replace("/signup");
          return;
        }
        if (data.subscriptionActive) {
          router.replace("/admin");
          return;
        }
        const checkout = await fetch("/api/billing/checkout", {
          method: "POST",
          credentials: "include",
        });
        const checkoutData = await checkout.json();
        if (checkout.ok && checkoutData.checkoutUrl) {
          window.location.href = checkoutData.checkoutUrl;
          return;
        }
        router.replace("/billing");
      })
      .catch(() => router.replace("/signup"));
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-slate-600">
      Starting checkout…
    </div>
  );
}
