"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type { Customer } from "@/lib/types";

export function ReportsCustomersSection() {
  const { loading: authLoading, activeStore } = useAdmin();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !activeStore) return;
    setLoading(true);
    adminFetch("/api/admin/customers")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load customers");
        setCustomers(d.customers ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [authLoading, activeStore]);

  if (loading) return <p className="text-slate-500">Loading customer report…</p>;
  if (error) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        {customers.length} customer account{customers.length === 1 ? "" : "s"} at{" "}
        {activeStore?.storeName}.
      </p>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
          <p className="text-lg font-medium text-slate-800">No customers yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Customers sign up when they scan your store QR. Share the link from{" "}
            <Link href="/admin/settings" className="text-indigo-600 hover:underline">
              Settings
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {customers.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
            >
              <p className="font-medium text-slate-900">
                {c.firstName} {c.lastName}
              </p>
              <p className="text-slate-600">{c.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                {c.phone}
                {c.createdAt && (
                  <> · Joined {new Date(c.createdAt).toLocaleDateString()}</>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
