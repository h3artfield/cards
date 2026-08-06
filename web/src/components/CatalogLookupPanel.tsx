"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { ScannedCard, VisionResult } from "@/lib/types";
import {
  normalizeSportsVisionFields,
  primarySportsSearchQuery,
} from "@/lib/processing/pricing/sports-search-queries";

interface CatalogHit {
  id?: string;
  name?: string;
  set?: string;
  loosePrice?: number;
  gradedPrice?: number;
  sourceUrl?: string;
  score: number;
  raw: Record<string, unknown>;
}

function defaultQuery(card: ScannedCard): string {
  const vision = card.visionJson as VisionResult | undefined;
  if (!vision) {
    return [card.year, card.setName, card.playerName ?? card.detectedName, card.cardNumber]
      .filter(Boolean)
      .join(" ");
  }
  if (vision.category === "sports") {
    const normalized = normalizeSportsVisionFields(vision);
    const q = primarySportsSearchQuery(normalized);
    if (q) return q;
    return [normalized.year, normalized.brand ?? normalized.setName, sportsPlayerFrom(normalized), normalized.cardNumber]
      .filter(Boolean)
      .join(" ");
  }
  return [vision.cardName, vision.setName, vision.cardNumber]
    .filter(Boolean)
    .join(" ");
}

function sportsPlayerFrom(vision: VisionResult): string {
  const player = vision.playerName?.trim();
  const cardName = vision.cardName?.trim();
  if (player) return player;
  return cardName ?? "";
}

export function CatalogLookupPanel({
  card,
  onApplied,
}: {
  card: ScannedCard;
  onApplied: () => void;
}) {
  const vision = card.visionJson as VisionResult | undefined;
  const category = vision?.category ?? card.category ?? "sports";
  const initialQuery = useMemo(() => defaultQuery(card), [card]);

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(category === "sports");
  const [queryTouched, setQueryTouched] = useState(false);

  useEffect(() => {
    if (!queryTouched) {
      setQuery(initialQuery);
    }
  }, [initialQuery, queryTouched]);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        category,
      });
      const res = await adminFetch(`/api/admin/catalog/search?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
      if (!data.results?.length) {
        setError("No matches — try year + player + set (e.g. 2023 Topps Chrome Mike Trout).");
      }
    } finally {
      setLoading(false);
    }
  }

  async function applyMatch(hit: CatalogHit) {
    setError(null);
    setApplyingId(hit.id ?? hit.name ?? "hit");
    try {
      const res = await adminFetch(`/api/admin/cards/${card.id}/apply-catalog`, {
        method: "POST",
        body: JSON.stringify({
          raw: hit.raw,
          sourceUrl: hit.sourceUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not apply match");
        return;
      }
      onApplied();
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-2.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between font-semibold text-sky-900"
      >
        <span>
          {category === "sports" ? "Sports card lookup" : "Catalog lookup"} (PriceCharting)
        </span>
        <span className="text-sky-600">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <form onSubmit={search} className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQueryTouched(true);
                setQuery(e.target.value);
              }}
              placeholder="Year brand player parallel…"
              className="min-w-[200px] flex-1 rounded-lg border px-2 py-1.5 text-sm"
            />
            <Button type="submit" variant="secondary" disabled={loading || !query.trim()}>
              {loading ? "Searching…" : "Search"}
            </Button>
          </form>

          {error && <p className="text-red-700">{error}</p>}

          {results.length > 0 && (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {results.map((hit) => (
                <li
                  key={hit.id ?? hit.name}
                  className="rounded-lg border border-white bg-white p-2 shadow-sm"
                >
                  <p className="font-medium text-gray-900">{hit.name}</p>
                  <p className="text-gray-600">{hit.set}</p>
                  <p className="text-gray-500">
                    {hit.loosePrice != null && `Ungraded $${hit.loosePrice.toFixed(2)}`}
                    {hit.gradedPrice != null && ` · Graded $${hit.gradedPrice.toFixed(2)}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hit.sourceUrl && (
                      <a
                        href={hit.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        PriceCharting
                      </a>
                    )}
                    <Button
                      variant="secondary"
                      disabled={applyingId !== null}
                      onClick={() => void applyMatch(hit)}
                    >
                      {applyingId === (hit.id ?? hit.name) ? "Applying…" : "Use this match"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
