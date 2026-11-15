"use client";

import { useEffect, useState } from "react";
import type { PrintingSearchOption } from "@/app/api/scan-index/printings/route";

interface PrintingPickerSheetProps {
  open: boolean;
  initialName?: string;
  initialGame?: "all" | "magic" | "pokemon";
  currentCatalogId?: string;
  onSelectPrinting: (printing: PrintingSearchOption) => void;
  onClose: () => void;
}

export function PrintingPickerSheet({
  open,
  initialName = "",
  initialGame = "all",
  currentCatalogId,
  onSelectPrinting,
  onClose,
}: PrintingPickerSheetProps) {
  const [query, setQuery] = useState(initialName);
  const [game, setGame] = useState<"all" | "magic" | "pokemon">(initialGame);
  const [printings, setPrintings] = useState<PrintingSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialName);
    setGame(initialGame);
    if (initialName.trim()) {
      void runSearch(initialName.trim(), initialGame, true);
    } else {
      setPrintings([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, initialGame]);

  async function runSearch(
    q: string,
    targetGame: "all" | "magic" | "pokemon" = game,
    exact = false,
  ) {
    const cleaned = q.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: cleaned,
        game: targetGame,
        ...(exact ? { exact: "1" } : {}),
      });
      const res = await fetch(`/api/scan-index/printings?${params}`);
      const data = (await res.json()) as {
        printings?: PrintingSearchOption[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setPrintings(data.printings ?? []);
      if (!(data.printings ?? []).length) {
        setError(`No printings found for “${cleaned}”.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load printings");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm">
      <div className="flex max-h-[85vh] flex-col rounded-t-2xl border-t border-neutral-800 bg-neutral-950 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              Select Card & Printing
            </h3>
            <p className="text-[11px] text-neutral-400">
              Tap the exact set / collector number, or search a different card name
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700"
          >
            Close
          </button>
        </div>

        {/* Search & Game Filter */}
        <div className="space-y-2 border-b border-neutral-800 px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query, game, false);
            }}
            className="flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Card name, set, or number (e.g. Sol Ring)"
              className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          <div className="flex gap-1.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "magic", label: "Magic" },
                { id: "pokemon", label: "Pokémon" },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGame(g.id);
                  if (query.trim()) void runSearch(query, g.id, false);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  game === g.id
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Printings Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-neutral-400">
              Loading printings…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-xs text-amber-300">{error}</p>
          ) : printings.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-500">
              Type a card name above and tap Search.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {printings.map((p) => {
                const isSelected =
                  Boolean(currentCatalogId) && p.catalogId === currentCatalogId;
                return (
                  <button
                    key={`${p.catalogSource}:${p.catalogId}`}
                    type="button"
                    onClick={() => onSelectPrinting(p)}
                    className={`flex flex-col items-start rounded-xl border p-2 text-left transition ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-950/30 ring-1 ring-emerald-400"
                        : "border-neutral-800 bg-neutral-900 hover:border-indigo-500/60"
                    }`}
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="mb-2 aspect-[2.5/3.5] w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="mb-2 flex aspect-[2.5/3.5] w-full items-center justify-center rounded-lg bg-neutral-800 text-[10px] text-neutral-500">
                        No Image
                      </div>
                    )}
                    <p className="w-full truncate text-xs font-bold text-white">
                      {p.name}
                    </p>
                    <p className="w-full truncate text-[11px] text-indigo-300">
                      {p.setName ?? p.setCode?.toUpperCase() ?? "Unknown Set"}
                    </p>
                    <p className="text-[10px] font-medium text-neutral-400">
                      {p.cardNumber ? `#${p.cardNumber}` : ""}
                      {p.setCode ? ` · ${p.setCode.toUpperCase()}` : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
