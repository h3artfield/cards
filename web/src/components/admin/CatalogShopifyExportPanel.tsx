"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { ShopifyBulkExportPanel } from "@/components/admin/ShopifyBulkExportPanel";
import { ShopifyReconcilePanel } from "@/components/admin/ShopifyReconcilePanel";
import { adminFetch } from "@/lib/api-client";
import type { CatalogExportResult } from "@/lib/shopify/export-inventory-item";

type ExportSummary = {
  integrationEnabled: boolean;
  eligible: number;
  listed: number;
  blocked: number;
  reasons: Record<string, number>;
  batchSize: number;
  preview: Array<{
    inventoryItemId: string;
    displayName: string;
    setName?: string;
    condition?: string;
    quantity: number;
    price: number | null;
  }>;
};

const REASON_LABELS: Record<string, string> = {
  out_of_stock: "no sellable units",
  missing_price: "no store or market price",
  missing_location: "no Shopify location picked in settings",
  withdrawn: "withdrawn",
  sold: "sold out",
};

/** Pushes CSV-imported inventory to Shopify so the whole shop can check out there. */
export function CatalogShopifyExportPanel({
  refreshKey,
  onExported,
}: {
  refreshKey: number;
  onExported: () => void;
}) {
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CatalogExportResult[] | null>(null);

  const loadSummary = useCallback(async () => {
    const res = await adminFetch("/api/admin/shopify/export-inventory");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load export status");
    return data as ExportSummary;
  }, []);

  useEffect(() => {
    let active = true;
    loadSummary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load export status",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadSummary, refreshKey]);

  async function runExport() {
    setExporting(true);
    setError(null);
    setResults(null);
    try {
      const res = await adminFetch("/api/admin/shopify/export-inventory", {
        method: "POST",
        body: JSON.stringify({ limit: summary?.batchSize ?? 25 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      setResults(data.results as CatalogExportResult[]);
      setSummary(await loadSummary());
      onExported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Checking Shopify listings…</p>
      </div>
    );
  }

  if (!summary?.integrationEnabled) {
    return null;
  }

  const blockedReasons = Object.entries(summary.reasons).filter(
    ([, count]) => count > 0,
  );

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        Push imported inventory to Shopify
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Creates one Shopify product per imported row, priced from{" "}
        <strong>My Store Price</strong> and stocked from{" "}
        <strong>Total Quantity</strong>. Checkout happens in Shopify. After the
        first export, every re-import pushes new quantities and prices to the
        listings automatically — export again only for rows added since.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
          {summary.eligible.toLocaleString()} ready to list
        </span>
        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
          {summary.listed.toLocaleString()} already on Shopify
        </span>
        {blockedReasons.map(([reason, count]) => (
          <span
            key={reason}
            className="rounded-full bg-slate-100 px-2 py-1 text-slate-600"
          >
            {count.toLocaleString()} skipped — {REASON_LABELS[reason] ?? reason}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={exporting || summary.eligible === 0}
          onClick={() => void runExport()}
        >
          {exporting
            ? "Creating listings…"
            : `List next ${Math.min(summary.eligible, summary.batchSize)}`}
        </Button>
        {summary.eligible > summary.batchSize ? (
          <p className="text-xs text-slate-500">
            Runs {summary.batchSize} at a time to stay inside Shopify rate
            limits — or start a full run below.
          </p>
        ) : null}
      </div>

      <ShopifyBulkExportPanel
        onProgress={() => {
          void loadSummary()
            .then(setSummary)
            .catch(() => undefined);
          onExported();
        }}
      />

      <ShopifyReconcilePanel
        onProgress={() => {
          void loadSummary()
            .then(setSummary)
            .catch(() => undefined);
          onExported();
        }}
      />

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {results ? (
        <div className="mt-4 max-h-64 overflow-auto rounded-lg border">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">Row</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.inventoryItemId} className="border-t align-top">
                  <td className="px-2 py-2 font-medium text-slate-900">
                    {r.displayName}
                  </td>
                  <td className="px-2 py-2">{r.quantity ?? "—"}</td>
                  <td className="px-2 py-2">
                    {r.exportPrice != null ? `$${r.exportPrice.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {r.ok ? (
                      <>
                        {r.productAdminUrl ? (
                          <a
                            href={r.productAdminUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-700 underline"
                          >
                            Listed
                          </a>
                        ) : (
                          <span className="text-emerald-700">Listed</span>
                        )}
                        {/* A listing that never reached a sales channel cannot
                            be bought, so the warning has to be visible. */}
                        {r.error ? (
                          <span className="mt-1 block text-amber-700">
                            {r.error}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-red-700">
                        {r.error ?? "Failed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
