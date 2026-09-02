"use client";

import { useEffect, useState } from "react";
import type { TradeCreditBalance, TradeCreditEntry } from "@/lib/types";

type Purchase = {
  id: string;
  ticketNumber: string;
  completedAt: string;
  subtotal: number;
  tradeCreditApplied: number;
  cashDue: number;
  lines: Array<{
    displayName: string;
    setName?: string;
    quantity: number;
    unitPrice: number;
  }>;
};

function entryLabel(entry: TradeCreditEntry): string {
  if (entry.type === "issued") {
    return entry.orderNumber
      ? `Trade credit from order ${entry.orderNumber}`
      : "Trade credit added";
  }
  if (entry.type === "spent") {
    return entry.note ?? "Spent in store";
  }
  return entry.note ?? "Adjustment";
}

/** The customer's own view of their store credit and in-store purchases. */
export function CustomerTradeCreditPanel({ slug }: { slug: string }) {
  const [balance, setBalance] = useState<TradeCreditBalance | null>(null);
  const [entries, setEntries] = useState<TradeCreditEntry[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const base = `/api/store/${encodeURIComponent(slug)}`;

    Promise.all([
      fetch(`${base}/trade-credit`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${base}/purchases`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([credit, bought]) => {
        if (!active) return;
        if (credit) {
          setBalance(credit.balance ?? null);
          setEntries((credit.entries ?? []).slice().reverse());
        }
        if (bought) setPurchases(bought.purchases ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <p className="mt-4 text-sm text-gray-500">Loading store credit…</p>
    );
  }

  return (
    <>
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Store credit
      </h2>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-3xl font-bold text-gray-900">
          ${(balance?.balance ?? 0).toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {balance && balance.balance > 0
            ? "Spend it in store — staff apply it at the register. Anything left over stays here."
            : "Trade in cards and choose trade credit to build a balance."}
        </p>

        {entries.length > 0 ? (
          <ul className="mt-4 divide-y text-sm">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-gray-900">
                    {entryLabel(entry)}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-medium ${
                    entry.amount >= 0 ? "text-emerald-700" : "text-gray-700"
                  }`}
                >
                  {entry.amount >= 0 ? "+" : "−"}$
                  {Math.abs(entry.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        In-store purchases
      </h2>
      {purchases.length === 0 ? (
        <p className="mt-4 text-gray-500">No counter purchases yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {purchases.map((purchase) => (
            <li
              key={purchase.id}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-gray-900">
                    {purchase.ticketNumber}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(purchase.completedAt).toLocaleString()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium text-gray-900">
                    ${purchase.cashDue.toFixed(2)}
                  </p>
                  {purchase.tradeCreditApplied > 0 ? (
                    <p className="text-xs text-emerald-700">
                      −${purchase.tradeCreditApplied.toFixed(2)} credit
                    </p>
                  ) : null}
                </div>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                {purchase.lines.map((line, i) => (
                  <li key={`${purchase.id}-${i}`}>
                    {line.quantity}× {line.displayName}
                    {line.setName ? ` · ${line.setName}` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
