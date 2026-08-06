"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (data.subscriptionActive) {
          setTimeout(() => router.replace("/admin"), 2500);
        }
      })
      .finally(() => setChecking(false));
  }, [router]);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">Payment received</h1>
        <p className="mt-4 text-slate-600">
          {checking
            ? "Confirming your subscription…"
            : "Your Card Scanner 9000 subscription is being activated. You will be redirected to your dashboard shortly."}
        </p>
        {sessionId ? (
          <p className="mt-2 text-xs text-slate-400">Session: {sessionId.slice(0, 20)}…</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/admin"
            className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Go to dashboard
          </Link>
          <Link
            href="/billing"
            className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Manage billing
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
