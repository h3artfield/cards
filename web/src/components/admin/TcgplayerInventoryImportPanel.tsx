"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { TcgplayerImportPreview } from "@/lib/tcgplayer-inventory/types";

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

export function TcgplayerInventoryImportPanel({
  onImported,
}: {
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<TcgplayerImportPreview | null>(null);
  const [csvTotals, setCsvTotals] = useState<{
    units: number;
    sumStoreUnit: number;
    sumTcgLowUnit: number;
    sumStoreExtended: number;
    inStockRows: number;
    rows: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setApplyMessage(null);
    setPreview(null);
    setCsvTotals(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
    };
    reader.readAsText(file);
  }

  async function runPreview() {
    if (!csvText) return;
    setLoading(true);
    setError(null);
    setApplyMessage(null);
    try {
      const res = await adminFetch("/api/admin/inventory/tcgplayer-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data.preview);
      setCsvTotals(data.csvTotals ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    if (!csvText) return;
    setApplying(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/inventory/tcgplayer-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, skipConflicts: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const r = data.result;
      setApplyMessage(
        `Imported: ${r.created} new, ${r.updated} updated, ${r.withdrawn} withdrawn, ${r.skipped} unchanged, ${r.conflicts} conflicts skipped.`,
      );
      setPreview(null);
    setCsvTotals(null);
      setCsvText(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setApplying(false);
    }
  }

  const previewRows = preview?.rows.filter((r) => r.action !== "unchanged").slice(0, 50) ?? [];

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        Import / update from TCGplayer CSV
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Export your full inventory from the TCGplayer seller portal, then upload
        here. Shelf prices come from column <strong>My Store Price</strong> only
        (not TCG Marketplace Price). Re-import anytime to sync cents-accurate
        prices from your pricing CSV. Quantity uses <strong>Total Quantity</strong>{" "}
        from the export (not My Store Reserve Qty). Rows with <strong>0 qty</strong>{" "}
        are kept as catalog placeholders
        (sealed boxes, restock slots) — when you restock in TCGplayer, re-import
        updates quantity without re-entering the SKU. Product images use each
        row&apos;s <strong>TCGplayer Id</strong>. Matched by{" "}
        <strong>TCGplayer Id + Condition</strong>.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!csvText || loading}
          onClick={() => void runPreview()}
        >
          {loading ? "Previewing…" : "Preview import"}
        </Button>
        {preview ? (
          <Button
            type="button"
            disabled={
              applying ||
              (preview.creates === 0 &&
                preview.updates === 0 &&
                preview.withdrawals === 0)
            }
            onClick={() => void runApply()}
          >
            {applying ? "Importing…" : "Apply import"}
          </Button>
        ) : null}
      </div>

      {fileName ? (
        <p className="mt-2 text-xs text-slate-500">Selected: {fileName}</p>
      ) : null}

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
          {csvTotals ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">CSV totals (matches Excel)</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <span>
                  <strong>{csvTotals.units.toLocaleString()}</strong> units (total qty)
                </span>
                <span>
                  Σ store: <strong>${csvTotals.sumStoreUnit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
                <span>
                  Σ TCG low: <strong>${csvTotals.sumTcgLowUnit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
                <span>
                  Σ store×qty: <strong>${csvTotals.sumStoreExtended.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-1">
              {preview.parsedCount} rows parsed
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
              {preview.createsInStock} in stock (new)
            </span>
            {preview.createsCatalog > 0 ? (
              <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-900">
                {preview.createsCatalog} catalog (0 qty)
              </span>
            ) : null}
            <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
              {preview.updates} updates
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">
              {preview.withdrawals} withdrawn
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1">
              {preview.unchanged} unchanged
            </span>
            {preview.conflicts > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">
                {preview.conflicts} conflicts (skipped on apply)
              </span>
            ) : null}
          </div>

          {previewRows.length > 0 ? (
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Price</th>
                    <th className="px-2 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.listingKey} className="border-t align-top">
                      <td className="px-2 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 capitalize ${actionBadge(row.action)}`}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <p className="max-w-[14rem] font-medium text-slate-900">
                          {row.displayName}
                        </p>
                        <p className="text-slate-500">ID {row.tcgplayerProductId}</p>
                      </td>
                      <td className="px-2 py-2">
                        {row.previousQuantity != null
                          ? `${row.previousQuantity} → ${row.quantity}`
                          : row.quantity}
                      </td>
                      <td className="px-2 py-2">
                        {row.previousListPrice != null
                          ? `$${row.previousListPrice.toFixed(2)} → $${row.listPrice.toFixed(2)}`
                          : `$${row.listPrice.toFixed(2)}`}
                      </td>
                      <td className="px-2 py-2 text-slate-500">{row.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No changes detected in this file.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
