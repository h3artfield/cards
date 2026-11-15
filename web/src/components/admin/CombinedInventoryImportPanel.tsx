"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { UnmatchedStoreRowV1 } from "@/lib/inventory/combined-list";

type CombineResult = {
  csv: string;
  counts: {
    tcgplayerRows: number;
    tcgplayerUnits: number;
    storeRows: number;
    matchedInFile: number;
    matchedCatalog: number;
    matchedSearch: number;
    foundByNameSearch: number;
    merged: number;
  };
  search: { requests: number; notSearched: number };
  pricing: {
    priced: number;
    estimated: number;
    missing: number;
    retried: number;
    unpriced: Array<{ name: string; setName: string; condition: string; tcgplayerId: string; reason: string }>;
    error?: string;
  };
  rowCount: number;
  units: { inStore: number; online: number };
  unmatched: UnmatchedStoreRowV1[];
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function unmatchedCsv(rows: UnmatchedStoreRowV1[]): string {
  const head = ["File", "Line", "Product Line", "Product Name", "Condition", "Number", "Set", "In Store", "Online", "Location", "Reason"];
  const body = rows.map((r) =>
    [r.file, r.line, r.productLine, r.productName, r.condition, r.number, r.setName, r.inStore, r.online, r.location, r.reason]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}

/** Picking again adds to the list, so files from different folders can be combined. */
function FilePicker({ label, files, onChange }: { label: string; files: File[]; onChange: (files: File[]) => void }) {
  return (
    <div className="text-xs font-medium text-slate-700">
      <label>
        {label}
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
            onChange([...files, ...picked.filter((f) => !seen.has(`${f.name}:${f.size}`))]);
            e.target.value = "";
          }}
        />
      </label>
      {files.length ? (
        <ul className="mt-2 space-y-1 font-normal">
          {files.map((f, i) => (
            <li key={`${f.name}:${f.size}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="shrink-0 text-red-700 hover:underline"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Step one of the singles import: joins the TCGplayer export (online stock)
 * with the store's shelf list (in-store and online quantities) and hands the
 * combined list to the TCGplayer import below for preview and apply.
 */
export function CombinedInventoryImportPanel({
  onCombined,
}: {
  onCombined: (csv: { text: string; name: string }) => void;
}) {
  const [tcgFiles, setTcgFiles] = useState<File[]>([]);
  const [storeFiles, setStoreFiles] = useState<File[]>([]);
  const [result, setResult] = useState<CombineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function combine() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const read = (files: File[]) =>
        Promise.all(files.map(async (f) => ({ name: f.name, text: await readFile(f) })));
      const [tcgplayerFiles, storeFilesText] = await Promise.all([read(tcgFiles), read(storeFiles)]);
      const res = await adminFetch("/api/admin/inventory/combined-import/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tcgplayerFiles, storeFiles: storeFilesText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Combine failed");
      setResult(data as CombineResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Combine failed");
    } finally {
      setLoading(false);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const multiSheet = storeFiles.length > 1;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Combine TCGplayer + store shelf lists</h3>
      <p className="mt-1 text-sm text-slate-600">
        Upload the TCGplayer kiosk export and the store inventory sheet. Either box takes several files at once (hold
        Ctrl to pick more than one) when a list is split up. Cards are matched on name, set, number and
        condition. TCGplayer quantities become <strong>Online</strong> stock, and the sheet&apos;s{" "}
        <strong>In Store</strong> and <strong>Online</strong> columns are added on top. Prices follow the shelf rule:
        $1 and up sells at TCG market, 60–99¢ becomes $1, 30–59¢ becomes 50¢, and under 30¢ becomes 25¢. Every card
        also gets its QR link. Then preview and apply the combined list in the TCGplayer import below.
      </p>
      <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">
        <strong>Adding a new batch later?</strong> Combine only the new cards, click <strong>Use in import below</strong>,
        then pick <strong>Add these cards to existing stock (new batch)</strong> in the import. Leave out the full
        TCGplayer export and anything already counted, or those copies get added twice.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FilePicker
          label="TCGplayer export"
          files={tcgFiles}
          onChange={(files) => {
            setTcgFiles(files);
            setResult(null);
          }}
        />
        <FilePicker
          label="Store inventory sheet"
          files={storeFiles}
          onChange={(files) => {
            setStoreFiles(files);
            setResult(null);
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={loading || (!tcgFiles.length && !storeFiles.length)}
          onClick={() => void combine()}
        >
          {loading ? "Combining…" : "Combine lists"}
        </Button>
        {loading ? (
          <span className="self-center text-xs text-slate-500">
            Cards that don&apos;t match right away are searched by name; this can take a couple of minutes.
          </span>
        ) : null}
        {result ? (
          <>
            <Button type="button" onClick={() => onCombined({ text: result.csv, name: `combined-inventory-${stamp}.csv` })}>
              Use in import below
            </Button>
            <Button type="button" variant="secondary" onClick={() => download(`combined-inventory-${stamp}.csv`, result.csv)}>
              Download combined CSV
            </Button>
          </>
        ) : null}
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-1">{result.rowCount.toLocaleString()} cards in combined list</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
              {result.units.inStore.toLocaleString()} in store
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
              {result.units.online.toLocaleString()} online
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1">
              {result.counts.matchedInFile.toLocaleString()} sheet rows matched TCGplayer
            </span>
            {result.counts.matchedCatalog > 0 ? (
              <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-900">
                {result.counts.matchedCatalog.toLocaleString()} found by set + number
              </span>
            ) : null}
            {result.counts.matchedSearch > 0 ? (
              <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-900">
                {result.counts.matchedSearch.toLocaleString()} found by name search
              </span>
            ) : null}
            {result.unmatched.length > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">
                {result.unmatched.length.toLocaleString()} sheet rows not matched (left out)
              </span>
            ) : null}
          </div>

          {result.counts.tcgplayerRows === 0 ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              No TCGplayer file was read, so Online only counts the sheet&apos;s own Online column. Add the TCGplayer
              inventory export to get online quantities.
            </p>
          ) : result.counts.tcgplayerUnits === 0 ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              The TCGplayer file has {result.counts.tcgplayerRows.toLocaleString()} rows but Add to Quantity is 0 or blank
              on every one, so nothing counts as online.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              TCGplayer file: {result.counts.tcgplayerRows.toLocaleString()} rows,{" "}
              {result.counts.tcgplayerUnits.toLocaleString()} units online.
            </p>
          )}

          <p className="text-xs text-slate-500">
            JustTCG priced {result.pricing.priced.toLocaleString()} cards
            {result.counts.foundByNameSearch
              ? `, ${result.counts.foundByNameSearch.toLocaleString()} of them found by a name search after their id came up empty`
              : ""}
            .
            {result.pricing.estimated
              ? ` ${result.pricing.estimated.toLocaleString()} prices are estimates or not JustTCG's exact card; the Price Note column says which and why.`
              : ""}
          </p>

          {result.pricing.missing > 0 ? (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              {result.pricing.missing.toLocaleString()} cards still have no price after searching JustTCG by id and by
              name, so their Saved Price and Location are blank
              {result.pricing.error ? ` (${result.pricing.error})` : ""}. Each one&apos;s reason is below and in the Price
              Note column.
              {result.pricing.unpriced.length ? (
                <details className="mt-1">
                  <summary className="cursor-pointer font-medium">Show them</summary>
                  <ul className="mt-1 max-h-48 overflow-auto">
                    {result.pricing.unpriced.map((u) => (
                      <li key={`${u.tcgplayerId}-${u.condition}`}>
                        {u.name} · {u.setName} · {u.condition} · #{u.tcgplayerId}: {u.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          {result.search.notSearched > 0 ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              {result.search.notSearched.toLocaleString()} unmatched cards weren&apos;t searched by name yet (lookup limit
              per run). Combine again to search the next batch.
            </p>
          ) : null}

          {result.unmatched.length > 0 ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-900">Not matched: fix these in the sheet and combine again</p>
                <button
                  type="button"
                  className="text-xs font-medium text-sky-700 hover:underline"
                  onClick={() => download(`unmatched-${stamp}.csv`, unmatchedCsv(result.unmatched))}
                >
                  Download list
                </button>
              </div>
              <div className="mt-1 max-h-56 overflow-auto rounded-lg border">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Row</th>
                      <th className="px-2 py-2">Card</th>
                      <th className="px-2 py-2">Qty</th>
                      <th className="px-2 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unmatched.slice(0, 200).map((r) => (
                      <tr key={`${r.file}:${r.line}`} className="border-t align-top">
                        <td className="px-2 py-2 text-slate-500">
                          {r.line}
                          {multiSheet ? <p className="max-w-32 truncate text-[11px]">{r.file}</p> : null}
                        </td>
                        <td className="px-2 py-2">
                          <p className="font-medium text-slate-900">{r.productName}</p>
                          <p className="text-slate-500">
                            {r.setName} {r.number ? `#${r.number}` : ""} · {r.condition}
                          </p>
                        </td>
                        <td className="px-2 py-2">{r.inStore + r.online}</td>
                        <td className="px-2 py-2 text-slate-500">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
