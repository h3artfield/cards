"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { CardLabelV1 } from "@/lib/inventory/card-label";

/** QR stickers for the DYMO LabelWriter (30336, 2-1/8" × 1"). */
export function CardLabelsPanel() {
  const [since, setSince] = useState(() => new Date().toISOString().slice(0, 10));
  const [perCopy, setPerCopy] = useState(true);
  const [inStoreOnly, setInStoreOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function make(body: { latest: true } | { since: string } | { all: true }) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await adminFetch("/api/admin/inventory/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, inStoreOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load labels");
      const labels = (data.labels ?? []) as CardLabelV1[];
      if (!labels.length) {
        setNote(
          "latest" in body
            ? data.latestBatchAt
              ? `The latest import didn't add any ${inStoreOnly ? "in-store " : ""}copies.`
              : "No import has added copies yet. Labels for earlier imports: use Labels since date."
            : "No cards to label for that choice.",
        );
        return;
      }
      const { buildCardLabelPdfV1 } = await import("@/lib/inventory/card-label-pdf");
      const blob = await buildCardLabelPdfV1(labels, { perCopy });
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
      const pages = perCopy ? labels.reduce((n, l) => n + Math.max(1, l.copies), 0) : labels.length;
      setNote(
        (data.latestBatchAt
          ? `Import of ${new Date(data.latestBatchAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: `
          : "") +
        `${pages.toLocaleString()} labels for ${labels.length.toLocaleString()} cards` +
          (data.skipped
            ? ` (${data.skipped} skipped${inStoreOnly ? ": no in-store copies or" : ":"} no TCGplayer id).`
            : ".") +
          (data.locationsFilled ? ` Filled in ${data.locationsFilled} missing locations from the rules.` : "") +
          (() => {
            const blank = labels.filter((l) => !l.location).length;
            return blank
              ? ` ${blank} still have no location (no price yet, or a Magic card the catalog can't place); they print first.`
              : "";
          })(),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make labels");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="qr-labels" className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">QR labels</h3>
      <p className="mt-1 text-sm text-slate-600">
        DYMO 30336 (2-1/8&quot; × 1&quot;). Each label has the QR code with the card name, set, condition, F/NF (Magic),
        rarity, card number and shelf location. Labels come out in location order. Scanning one opens that card&apos;s page in the
        store inventory, and Shopify POS rings it up from the same code. Print the PDF at 100% (actual size) to the
        LabelWriter.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy} onClick={() => void make({ latest: true })}>
          {busy ? "Making…" : "Labels for latest import"}
        </Button>
        <span className="text-xs text-slate-600">
          Only the copies the last import added. Extra copies of a card already on the shelf get just their new labels.
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
        <label className="text-xs font-medium text-slate-700">
          Imported since
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="mt-1 block rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !since}
          onClick={() => void make({ since: `${since}T00:00:00.000Z` })}
        >
          Labels since date
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void make({ all: true })}>
          All in stock
        </Button>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={perCopy} onChange={(e) => setPerCopy(e.target.checked)} />
          One label per copy
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={inStoreOnly} onChange={(e) => setInStoreOnly(e.target.checked)} />
          In-store copies only
        </label>
      </div>
      {note ? <p className="mt-3 text-sm text-slate-600">{note}</p> : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
