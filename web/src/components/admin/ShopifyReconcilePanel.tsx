"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";

type ReconcileSummary = {
  considered: number;
  quantityPushed: number;
  pricePushed: number;
  drafted: number;
  reactivated: number;
  unchanged: number;
  failed: number;
  stoppedEarly?: boolean;
  outcomes: { displayName: string; error?: string }[];
};

function describe(summary: ReconcileSummary): string {
  const parts: string[] = [];
  if (summary.quantityPushed) {
    parts.push(`${summary.quantityPushed.toLocaleString()} quantity updated`);
  }
  if (summary.pricePushed) {
    parts.push(`${summary.pricePushed.toLocaleString()} price updated`);
  }
  if (summary.drafted) {
    parts.push(`${summary.drafted.toLocaleString()} pulled from storefront`);
  }
  if (summary.reactivated) {
    parts.push(`${summary.reactivated.toLocaleString()} put back on sale`);
  }
  if (summary.failed) {
    parts.push(`${summary.failed.toLocaleString()} failed`);
  }
  if (!parts.length) return "Shopify already matched your inventory.";
  return parts.join(" · ");
}

/**
 * Forces Shopify back in line with our inventory. Imports already push the
 * rows they touch, so this is for drift they cannot see: failed pushes, missed
 * webhooks, and products edited directly in the Shopify admin.
 */
export function ShopifyReconcilePanel({
  onProgress,
}: {
  onProgress: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reconcile() {
    setRunning(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/shopify/reconcile", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reconcile failed");
      setSummary(data.summary as ReconcileSummary);
      onProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile failed");
    } finally {
      setRunning(false);
    }
  }

  const failures = summary?.outcomes.filter((o) => o.error) ?? [];

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Match Shopify to our inventory
          </h4>
          <p className="text-xs text-slate-600">
            Checks every listing against what we hold. Sold-out cards leave the
            storefront; restocked ones go back on sale.
          </p>
        </div>
        <Button variant="secondary" onClick={reconcile} disabled={running}>
          {running ? "Checking…" : "Reconcile now"}
        </Button>
      </div>

      {summary ? (
        <div className="mt-3 text-xs">
          <p className="text-slate-700">
            Checked {summary.considered.toLocaleString()} listing
            {summary.considered === 1 ? "" : "s"} — {describe(summary)}
          </p>
          {summary.stoppedEarly ? (
            <p className="mt-1 text-amber-700">
              Stopped early to stay inside the request limit. Run it again to
              finish the rest.
            </p>
          ) : null}
          {failures.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-slate-700">
                {failures.length} row{failures.length === 1 ? "" : "s"} failed
              </summary>
              <ul className="mt-1 space-y-1">
                {failures.slice(0, 10).map((f, i) => (
                  <li key={`${f.displayName}-${i}`}>
                    <span className="text-slate-800">{f.displayName}</span>
                    <span className="text-red-700"> — {f.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
