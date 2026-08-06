"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { ShopifyImportPreview } from "@/lib/shopify-inventory/types";

function actionBadge(action: string): string {
  switch (action) {
    case "create":
      return "bg-emerald-100 text-emerald-800";
    case "update":
      return "bg-sky-100 text-sky-800";
    case "withdraw":
      return "bg-amber-100 text-amber-900";
    case "conflict":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function ShopifyInventoryImportPanel({
  onImported,
}: {
  onImported: () => void;
}) {
  const [preview, setPreview] = useState<ShopifyImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setApplyMessage(null);
    try {
      const res = await adminFetch("/api/admin/inventory/shopify-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    setApplying(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/inventory/shopify-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipConflicts: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const r = data.result;
      setApplyMessage(
        `Shopify import: ${r.created} new, ${r.updated} updated, ${r.withdrawn} withdrawn, ${r.skipped} unchanged, ${r.conflicts} conflicts skipped (${data.shopifyVariants} variants pulled).`,
      );
      setPreview(null);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setApplying(false);
    }
  }

  const previewRows =
    preview?.rows.filter((r) => r.action !== "unchanged").slice(0, 40) ?? [];

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Shopify inventory import</p>
      <p className="mt-1 text-xs text-slate-500">
        Pull products from your connected Shopify store into the main inventory hub.
        Uses the OAuth connection from Settings → Integrations.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={loading} onClick={runPreview}>
          {loading ? "Pulling from Shopify…" : "Preview Shopify import"}
        </Button>
        {preview ? (
          <Button type="button" disabled={applying} onClick={runApply}>
            {applying ? "Importing…" : "Apply import"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>
      ) : null}
      {applyMessage ? (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
          {applyMessage}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-5 text-center text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="font-bold text-slate-900">{preview.totalShopifyVariants}</p>
              <p className="text-slate-500">Shopify variants</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2">
              <p className="font-bold text-emerald-800">{preview.creates}</p>
              <p className="text-emerald-700">New</p>
            </div>
            <div className="rounded-lg bg-sky-50 p-2">
              <p className="font-bold text-sky-800">{preview.updates}</p>
              <p className="text-sky-700">Update</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <p className="font-bold text-amber-900">{preview.withdraws}</p>
              <p className="text-amber-800">Withdraw</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="font-bold text-slate-700">{preview.unchanged}</p>
              <p className="text-slate-500">Unchanged</p>
            </div>
          </div>

          {previewRows.length > 0 ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {previewRows.map((row) => (
                <li
                  key={row.variant.shopifyVariantKey}
                  className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-slate-800">
                    {row.variant.productTitle}
                    {row.variant.variantTitle !== "Default Title"
                      ? ` — ${row.variant.variantTitle}`
                      : ""}
                    {" · "}${row.variant.price.toFixed(2)} · qty {row.variant.quantity}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${actionBadge(row.action)}`}
                  >
                    {row.action}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">All Shopify variants already match inventory.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
