"use client";

import { Fragment, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import { Button } from "@/components/Button";
import type { CatalogMatchQueueRow } from "@/lib/deck-builder/catalog-match-queue";

type ScryfallHit = {
  scryfallId: string;
  name: string;
  setName?: string;
  setCode: string;
  collectorNumber: string;
  imageNormal?: string;
  typeLine?: string;
};

function cardLabelFromInventory(row: CatalogMatchQueueRow): string {
  const base = row.displayName.split(" — ")[0]?.trim() ?? row.displayName;
  return base;
}

export function CatalogMatchQueuePanel({
  rows,
  onResolved,
}: {
  rows: CatalogMatchQueueRow[];
  onResolved: () => void;
}) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ScryfallHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [applyBusy, setApplyBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function openResolver(row: CatalogMatchQueueRow) {
    setResolvingId(row.inventoryItemId);
    setSearchQuery(cardLabelFromInventory(row));
    setSearchResults([]);
    setMessage(null);
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setMessage(null);
    try {
      const res = await adminFetch(
        `/api/admin/inventory/scryfall-search?q=${encodeURIComponent(q)}&limit=12`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Search failed");
      }
      setSearchResults((data.results ?? []) as ScryfallHit[]);
      if (!(data.results as ScryfallHit[] | undefined)?.length) {
        setMessage("No Scryfall printings found — try a shorter name or paste a Scryfall UUID.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function applyMatch(inventoryItemId: string, scryfallId: string) {
    setApplyBusy(scryfallId);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/inventory/catalog-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryItemId, scryfallId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Apply failed");
      }
      setMessage(
        `Linked to ${String(data.catalogName)} (${String(data.setName ?? data.setCode)} #${String(data.collectorNumber)})`,
      );
      setResolvingId(null);
      onResolved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplyBusy(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200 bg-amber-50/50">
      {message ? (
        <p className="border-b border-amber-200 px-3 py-2 text-xs text-slate-700">{message}</p>
      ) : null}
      <table className="min-w-full text-left text-xs text-slate-700">
        <thead className="border-b border-amber-200 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="px-3 py-2 font-medium">Set / #</th>
            <th className="px-3 py-2 font-medium">Match</th>
            <th className="px-3 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.inventoryItemId}>
              <tr className="border-b border-amber-100">
                <td className="px-3 py-2">{row.reason}</td>
                <td className="px-3 py-2">{row.displayName}</td>
                <td className="px-3 py-2">
                  {[row.setName, row.cardNumber].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2">
                  {row.catalogMatchMethod ?? "—"}
                  {row.catalogScryfallId
                    ? ` · ${row.catalogScryfallId.slice(0, 8)}…`
                    : ""}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-indigo-600 underline"
                    onClick={() => openResolver(row)}
                  >
                    Resolve
                  </button>
                </td>
              </tr>
              {resolvingId === row.inventoryItemId ? (
                <tr>
                  <td colSpan={5} className="bg-white px-3 py-3">
                    <p className="mb-2 text-xs font-medium text-slate-700">
                      Pick the correct Scryfall printing for{" "}
                      <span className="text-slate-900">{row.displayName}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                        placeholder="Card name or Scryfall UUID"
                        className="min-w-[240px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <Button
                        disabled={searchLoading}
                        onClick={() => void runSearch()}
                      >
                        {searchLoading ? "Searching…" : "Search Scryfall"}
                      </Button>
                      <button
                        type="button"
                        className="text-xs text-slate-500 underline"
                        onClick={() => setResolvingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    {searchResults.length > 0 ? (
                      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                        {searchResults.map((hit) => (
                          <li
                            key={hit.scryfallId}
                            className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-2"
                          >
                            {hit.imageNormal ? (
                              <img
                                src={hit.imageNormal}
                                alt=""
                                className="h-12 w-auto rounded"
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900">{hit.name}</p>
                              <p className="text-slate-600">
                                {[hit.setName ?? hit.setCode, `#${hit.collectorNumber}`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {hit.typeLine ? (
                                <p className="truncate text-slate-500">{hit.typeLine}</p>
                              ) : null}
                            </div>
                            <Button
                              disabled={applyBusy != null}
                              onClick={() =>
                                void applyMatch(row.inventoryItemId, hit.scryfallId)
                              }
                            >
                              {applyBusy === hit.scryfallId ? "Linking…" : "Use this printing"}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
