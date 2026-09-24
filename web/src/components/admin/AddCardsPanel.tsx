"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { ConditionEstimate } from "@/lib/types";

type PrintingHit = {
  scryfallId: string;
  name: string;
  setName?: string;
  setCode: string;
  collectorNumber: string;
  rarity?: string;
  imageNormal?: string;
  typeLine?: string;
};

type AddedRow = {
  id: string;
  label: string;
  quantity: number;
  warning?: string;
};

const CONDITIONS: { value: ConditionEstimate; label: string }[] = [
  { value: "NM", label: "Near Mint" },
  { value: "LP", label: "Lightly Played" },
  { value: "MP", label: "Moderately Played" },
  { value: "HP", label: "Heavily Played" },
  { value: "DMG", label: "Damaged" },
];

function printingLabel(hit: PrintingHit): string {
  const set = hit.setName ?? hit.setCode.toUpperCase();
  return `${hit.name} — ${set} #${hit.collectorNumber}`;
}

/**
 * Clerk entry for stock that never came from a CSV: packs we opened, or a trade
 * taken at the counter. Picking the printing links the row to the catalog so it
 * shows up in the deck builder, and the row is immediately ready for Shopify.
 */
export function AddCardsPanel({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PrintingHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PrintingHit | null>(null);

  const [condition, setCondition] = useState<ConditionEstimate>("NM");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedRow[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/inventory/scryfall-search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Card search failed");
      setHits((data.results ?? []) as PrintingHit[]);
      if (!data.results?.length) setError(`No printings found for “${q}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card search failed");
    } finally {
      setSearching(false);
    }
  }

  function reset() {
    setSelected(null);
    setHits([]);
    setQuery("");
    setQuantity("1");
    setPrice("");
    setUnitCost("");
    searchRef.current?.focus();
  }

  async function submit() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/inventory/manual-add", {
        method: "POST",
        body: JSON.stringify({
          displayName: selected.name,
          setName: selected.setName ?? selected.setCode.toUpperCase(),
          cardNumber: selected.collectorNumber,
          category: "magic",
          condition,
          quantity: Number(quantity),
          price: Number(price),
          unitCost: unitCost.trim() ? Number(unitCost) : undefined,
          scryfallId: selected.scryfallId,
          imageUrl: selected.imageNormal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add the cards");

      setAdded((prev) => [
        {
          id: data.item?.id ?? selected.scryfallId,
          label: printingLabel(selected),
          quantity: Number(quantity),
          warning: data.catalogWarning,
        },
        ...prev.slice(0, 9),
      ]);
      reset();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the cards");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Add cards</h3>
            <p className="text-xs text-slate-600">
              Enter singles from packs you opened or a counter trade.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Add cards</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Add cards</h3>
          <p className="text-xs text-slate-600">
            Search the card, set the condition and price, then add. Priced rows
            are ready to list on Shopify.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Card name, e.g. Lightning Bolt"
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          aria-label="Card name"
        />
        <Button variant="secondary" onClick={runSearch} disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>

      {hits.length && !selected ? (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.scryfallId}>
              <button
                type="button"
                onClick={() => {
                  setSelected(hit);
                  setHits([]);
                  setError(null);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-2 text-left hover:bg-slate-50"
              >
                {hit.imageNormal ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hit.imageNormal}
                    alt=""
                    className="h-14 w-10 rounded object-cover"
                  />
                ) : null}
                <span className="text-sm">
                  <span className="font-medium text-slate-900">{hit.name}</span>
                  <span className="block text-xs text-slate-600">
                    {hit.setName ?? hit.setCode.toUpperCase()} #
                    {hit.collectorNumber}
                    {hit.rarity ? ` · ${hit.rarity}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {selected.imageNormal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.imageNormal}
                  alt=""
                  className="h-20 w-14 rounded object-cover"
                />
              ) : null}
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {selected.name}
                </p>
                <p className="text-xs text-slate-600">
                  {selected.setName ?? selected.setCode.toUpperCase()} #
                  {selected.collectorNumber}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium text-slate-600 underline"
            >
              Change card
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-medium text-slate-700">
              Condition
              <select
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as ConditionEstimate)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-700">
              Quantity
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </label>

            <label className="text-xs font-medium text-slate-700">
              Price each
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </label>

            <label className="text-xs font-medium text-slate-700">
              Cost each
              <input
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="optional"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3">
            <Button onClick={submit} disabled={saving || !price.trim()}>
              {saving ? "Adding…" : "Add to inventory"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {added.length ? (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-slate-700">
            Added this session
          </h4>
          <ul className="mt-1 space-y-1">
            {added.map((row) => (
              <li key={row.id} className="text-xs text-slate-700">
                {row.quantity}× {row.label}
                {row.warning ? (
                  <span className="text-amber-700"> — {row.warning}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
