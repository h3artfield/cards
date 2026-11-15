"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import { runInventoryImageCacheLoop } from "@/lib/inventory/run-image-cache-loop";
import type { TcgplayerImportWithdrawalRisk } from "@/lib/tcgplayer-inventory/import-guard";
import type {
  TcgplayerImportMode,
  TcgplayerImportPreview,
} from "@/lib/tcgplayer-inventory/types";

const IMPORT_MODES: Array<{ value: TcgplayerImportMode; label: string; help: string }> = [
  {
    value: "add",
    label: "Add these cards to existing stock (new batch)",
    help: "Use this for a new binder, case or online batch. Only adds copies — never removes cards or lowers counts. Include only the new cards; anything already counted would be added twice.",
  },
  {
    value: "replace",
    label: "Replace ALL inventory with this file (full recount only)",
    help: "Only for a full store recount. Quantities are set to what the file says, and every card missing from the file — including cases and binders already on the shelf — is marked out of stock.",
  },
];

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
  initialCsv,
}: {
  onImported: () => void;
  /** Preloaded file, e.g. from the combined list; remount (key) to replace. */
  initialCsv?: { text: string; name: string } | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(initialCsv?.text ?? null);
  const [fileName, setFileName] = useState<string | null>(initialCsv?.name ?? null);
  const [mode, setMode] = useState<TcgplayerImportMode>("add");
  const [preview, setPreview] = useState<TcgplayerImportPreview | null>(null);
  const [csvTotals, setCsvTotals] = useState<{
    units: number;
    sumStoreUnit: number;
    sumTcgLowUnit: number;
    sumStoreExtended: number;
    inStockRows: number;
    rows: number;
  } | null>(null);
  const [risk, setRisk] = useState<TcgplayerImportWithdrawalRisk | null>(null);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [cachingImages, setCachingImages] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setApplyMessage(null);
    setPreview(null);
    setCsvTotals(null);
    setRisk(null);
    setConfirmWithdrawal(false);
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
        body: JSON.stringify({ csv: csvText, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data.preview);
      setCsvTotals(data.csvTotals ?? null);
      setRisk(data.risk ?? null);
      setConfirmWithdrawal(false);
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
        body: JSON.stringify({
          csv: csvText,
          skipConflicts: true,
          confirmLargeWithdrawal: confirmWithdrawal,
          mode: preview?.mode ?? mode,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.risk) {
        setRisk(data.risk);
        throw new Error(data.error ?? "Import needs confirmation");
      }
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const r = data.result;
      const scopeNote =
        r.outOfScopeRows > 0
          ? ` ${r.outOfScopeRows} rows left untouched (product lines not in this file).`
          : "";
      const firstPass = data.imageCache as
        | { cached: number; failed: number; remaining: number }
        | undefined;
      setApplyMessage(
        r.mode === "add"
          ? `Added ${r.unitsAdded.toLocaleString()} copies: ${r.created} new cards, ${r.updated} existing cards got more copies. Nothing was removed. Next: QR labels → "Labels for latest import" prints just these copies.`
          : `Imported: ${r.created} new, ${r.updated} updated, ${r.withdrawn} withdrawn, ${r.skipped} unchanged, ${r.conflicts} conflicts skipped.${scopeNote}`,
      );
      setPreview(null);
      setCsvTotals(null);
      setRisk(null);
      setConfirmWithdrawal(false);
      setCsvText(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      onImported();

      if (firstPass && firstPass.remaining > 0) {
        setCachingImages(true);
        setCacheStatus(
          `First pass cached ${firstPass.cached.toLocaleString()} images (${firstPass.remaining.toLocaleString()} left)…`,
        );
        try {
          const loop = await runInventoryImageCacheLoop({
            onProgress: ({ run, totalCached, totalFailed, batch }) => {
              setCacheStatus(
                `Caching images (run ${run}) — ${totalCached.toLocaleString()} saved, ${totalFailed.toLocaleString()} unavailable, ${batch.remaining.toLocaleString()} left…`,
              );
            },
          });
          setApplyMessage(
            (prev) =>
              `${prev ?? ""} Images: ${loop.totalCached.toLocaleString()} cached to Firebase` +
              (loop.remaining > 0
                ? `, ${loop.remaining.toLocaleString()} still pending (sealed/unknown SKUs).`
                : ", all in-stock rows have art."),
          );
        } catch (cacheErr) {
          setError(
            cacheErr instanceof Error
              ? cacheErr.message
              : "Import succeeded but image cache failed",
          );
        } finally {
          setCachingImages(false);
          setCacheStatus(null);
          onImported();
        }
      } else if (firstPass) {
        setApplyMessage(
          (prev) =>
            `${prev ?? ""} Images: ${firstPass.cached.toLocaleString()} cached` +
            (firstPass.remaining > 0
              ? `, ${firstPass.remaining.toLocaleString()} still pending.`
              : ", all in-stock rows have art."),
        );
      }
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
        updates quantity without re-entering the SKU. After apply, card art is
        fetched and saved to Firebase automatically so customers never see blank
        tiles. Matched by <strong>TCGplayer Id + Condition</strong>.
      </p>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-xs font-semibold text-slate-900">What is this file?</legend>
        {IMPORT_MODES.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-sm ${
              mode !== option.value
                ? "border-slate-200"
                : option.value === "replace"
                  ? "border-red-500 bg-red-950/60"
                  : "border-indigo-400 bg-indigo-100"
            }`}
          >
            <input
              type="radio"
              name="tcgplayer-import-mode"
              className="mt-1"
              checked={mode === option.value}
              onChange={() => {
                setMode(option.value);
                setPreview(null);
                setCsvTotals(null);
                setRisk(null);
                setConfirmWithdrawal(false);
                setApplyMessage(null);
              }}
            />
            <span>
              <span className="font-medium text-slate-900">{option.label}</span>
              <span className="block text-xs text-slate-600">{option.help}</span>
            </span>
          </label>
        ))}
        {mode === "replace" ? (
          <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800">
            Replace is only for a full recount of every card in the store. For a new binder, case or online file, pick
            &quot;Add these cards to existing stock&quot;.
          </p>
        ) : null}
      </fieldset>

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
              cachingImages ||
              (risk?.requiresConfirmation && !confirmWithdrawal) ||
              (preview.creates === 0 &&
                preview.updates === 0 &&
                preview.withdrawals === 0)
            }
            onClick={() => void runApply()}
          >
            {applying
              ? "Importing…"
              : cachingImages
                ? "Caching images…"
                : preview.mode === "add"
                  ? "Add to stock"
                  : "Replace inventory"}
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
      {cacheStatus ? (
        <p className="mt-2 text-sm text-slate-600">{cacheStatus}</p>
      ) : null}

      {risk?.requiresConfirmation ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Unusually large withdrawal</p>
          <p className="mt-1">{risk.message}</p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={confirmWithdrawal}
              onChange={(e) => setConfirmWithdrawal(e.target.checked)}
            />
            I checked the file and these items really are out of stock
          </label>
        </div>
      ) : null}

      {preview?.mode === "add" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-1">
              {preview.parsedCount} rows in file
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
              {preview.creates} new cards
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
              {preview.updates} existing cards getting more copies
            </span>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-900">
              {preview.unitsAdded.toLocaleString()} copies added
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1">
              0 removed or withdrawn
            </span>
            {preview.ignoredZeroQtyRows > 0 ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">
                {preview.ignoredZeroQtyRows} rows with 0 qty ignored
              </span>
            ) : null}
          </div>
          {previewRows.length > 0 ? (
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Card</th>
                    <th className="px-2 py-2">Copies</th>
                    <th className="px-2 py-2">Price</th>
                    <th className="px-2 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.listingKey} className="border-t align-top">
                      <td className="px-2 py-2">
                        <p className="max-w-[14rem] font-medium text-slate-900">
                          {row.displayName}
                        </p>
                        <p className="text-slate-500">ID {row.tcgplayerProductId}</p>
                      </td>
                      <td className="px-2 py-2">
                        {row.previousQuantity != null
                          ? `${row.previousQuantity} → ${row.quantity} (+${row.addedQuantity ?? 0})`
                          : `New: ${row.quantity}`}
                      </td>
                      <td className="px-2 py-2">${row.listPrice.toFixed(2)}</td>
                      <td className="px-2 py-2 text-slate-500">
                        {row.message ?? (row.action === "create" ? "New card" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No cards with copies to add in this file.</p>
          )}
          {preview.rows.length > previewRows.length ? (
            <p className="text-xs text-slate-500">
              Showing the first {previewRows.length} of {preview.rows.length} cards.
            </p>
          ) : null}
        </div>
      ) : preview ? (
        <div className="mt-4 space-y-3">
          {preview.csvProductLines.length > 0 ? (
            <p className="text-xs text-slate-600">
              File covers{" "}
              <strong>{preview.csvProductLines.join(", ")}</strong>. Rows in
              other product lines are never touched
              {preview.outOfScopeRows > 0
                ? ` — ${preview.outOfScopeRows.toLocaleString()} left as-is.`
                : "."}
            </p>
          ) : null}
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
