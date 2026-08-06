"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export default function StoreLoginPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data.session?.role === "store") {
          router.replace(data.subscriptionActive ? "/admin" : "/billing");
        } else if (data.session?.role === "platform") {
          router.replace("/admin/stores");
        }
      })
      .catch(() => {});
  }, [router]);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold text-slate-900">Store login</h1>
        <p className="mt-2 text-slate-600">
          Sign in to your store dashboard to review orders, confirm card versions, and manage
          buyback settings.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <AdminLoginForm
            expectedRole="store"
            title=""
            subtitle=""
            redirectTo="/admin"
            compact
          />
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          New store?{" "}
          <Link href="/signup" className="font-medium text-violet-700 hover:underline">
            Sign up for $100/month
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
