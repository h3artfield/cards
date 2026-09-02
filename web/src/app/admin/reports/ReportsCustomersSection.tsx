"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type {
  Customer,
  TradeCreditBalance,
  TradeCreditEntry,
} from "@/lib/types";

function creditEntryLabel(entry: TradeCreditEntry): string {
  if (entry.type === "issued") {
    return entry.orderNumber ? `Order ${entry.orderNumber}` : "Credit added";
  }
  if (entry.type === "spent") return entry.note ?? "Spent in store";
  return entry.note ?? "Adjustment";
}

/** Staff view of one customer's credit, so the counter can answer questions. */
function CustomerCreditHistory({ customerId }: { customerId: string }) {
  const [balance, setBalance] = useState<TradeCreditBalance | null>(null);
  const [entries, setEntries] = useState<TradeCreditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminFetch(
      `/api/admin/customers/${encodeURIComponent(customerId)}/trade-credit`,
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load credit");
        if (!active) return;
        setBalance(data.balance ?? null);
        setEntries((data.entries ?? []).slice().reverse());
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load credit");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (loading) {
    return <p className="mt-2 text-xs text-slate-400">Loading credit…</p>;
  }
  if (error) {
    return <p className="mt-2 text-xs text-red-600">{error}</p>;
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm">
        <span className="font-semibold text-slate-900">
          ${(balance?.balance ?? 0).toFixed(2)}
        </span>{" "}
        <span className="text-xs text-slate-500">
          available · ${(balance?.issued ?? 0).toFixed(2)} issued · $
          {(balance?.spent ?? 0).toFixed(2)} spent
        </span>
      </p>

      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No credit activity yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 text-xs">
          {entries.map((entry) => (
            <li key={entry.id} className="flex justify-between gap-3 py-1">
              <span className="min-w-0 truncate text-slate-700">
                {creditEntryLabel(entry)}
                <span className="ml-1 text-slate-400">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </span>
              <span
                className={
                  entry.amount >= 0
                    ? "shrink-0 text-emerald-700"
                    : "shrink-0 text-slate-700"
                }
              >
                {entry.amount >= 0 ? "+" : "−"}${Math.abs(entry.amount).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReportsCustomersSection() {
  const { loading: authLoading, activeStore } = useAdmin();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadedStoreId, setLoadedStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);

  const storeId = activeStore?.id ?? null;
  // Switching stores puts the section back into its loading state on its own.
  const loading = authLoading || !storeId || loadedStoreId !== storeId;

  useEffect(() => {
    if (authLoading || !storeId) return;

    let active = true;
    adminFetch("/api/admin/customers")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load customers");
        if (active) {
          setCustomers(d.customers ?? []);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Load failed");
      })
      .finally(() => {
        if (active) setLoadedStoreId(storeId);
      });

    return () => {
      active = false;
    };
  }, [authLoading, storeId]);

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
              <button
                type="button"
                onClick={() => setOpenCustomerId(openCustomerId === c.id ? null : c.id)}
                className="mt-2 text-xs text-indigo-600 hover:underline"
              >
                {openCustomerId === c.id ? "Hide" : "Trade credit"}
              </button>
              {openCustomerId === c.id ? (
                <CustomerCreditHistory customerId={c.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
