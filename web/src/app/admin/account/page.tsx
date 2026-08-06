"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccountForms } from "@/components/admin/AdminAccountForms";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";

type AccountInfo = {
  email: string;
  role: "platform" | "store";
  storeId?: string;
};

export default function PlatformAccountPage() {
  const router = useRouter();
  const { session, loading: authLoading, refresh } = useAdmin();
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (session?.role !== "platform") {
      router.replace("/admin/settings");
      return;
    }
    adminFetch("/api/admin/account")
      .then((r) => r.json())
      .then((d) => setAccount(d.account ?? null));
  }, [authLoading, session, router]);

  if (authLoading || session?.role !== "platform") {
    return (
      <AdminLayout showStoreTabs={false}>
        <p className="text-slate-500">Loading…</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout showStoreTabs={false}>
      <Link href="/admin/stores" className="text-sm text-indigo-600 hover:underline">
        ← All stores
      </Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900">Platform account</h2>
      <p className="mt-1 text-sm text-slate-600">
        Your login for{" "}
        <Link href="/admin/login" className="text-indigo-600 hover:underline">
          /admin/login
        </Link>
        . Separate from any store owner accounts.
      </p>
      <div className="mt-6 max-w-md">
        <AdminAccountForms
          account={account}
          onAccountUpdated={async (next) => {
            setAccount(next);
            await refresh();
          }}
        />
      </div>
    </AdminLayout>
  );
}
