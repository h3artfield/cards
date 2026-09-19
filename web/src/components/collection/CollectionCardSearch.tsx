"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authButtonSecondary,
  authError,
  authInput,
  authSubtext,
} from "@/lib/customer-auth-ui";
import type { CollectionCard } from "@/lib/types";

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

function printingMeta(hit: PrintingHit): string {
  const set = hit.setName ?? hit.setCode.toUpperCase();
  return `${set} #${hit.collectorNumber}${hit.rarity ? ` · ${hit.rarity}` : ""}`;
}

export function CollectionCardSearch({
  slug,
  onAdded,
}: {
  slug: string;
  onAdded: (card: CollectionCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PrintingHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PrintingHit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    if (selected && q === selected.name) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(q);
    }, 280);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  async function runSearch(q: string) {
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<{ results?: PrintingHit[] }>(
        `/api/store/${encodeURIComponent(slug)}/collection/card-search?q=${encodeURIComponent(q)}`,
      );
      setHits(data.results ?? []);
      if (!data.results?.length) setError(`No printings found for “${q}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card search failed");
    } finally {
      setSearching(false);
    }
  }

  async function addSelected() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ card: CollectionCard }>(
        `/api/store/${encodeURIComponent(slug)}/collection`,
        {
          method: "POST",
          body: JSON.stringify({ scryfallId: selected.scryfallId }),
        },
      );
      onAdded(data.card);
      setSelected(null);
      setHits([]);
      setQuery("");
      searchRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--line-subtle)] bg-[var(--ink-800)] p-4">
      <p className="text-sm font-semibold text-[var(--text-hi)]">Add by name</p>
      <p className={`mt-1 ${authSubtext}`}>
        Type the card, then pick the set and art so the exact printing goes in your binder.
      </p>

      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
          setError(null);
        }}
        placeholder="Card name, e.g. Lightning Bolt"
        className={authInput}
        aria-label="Search for a card to add"
      />

      {searching ? <p className={`mt-3 ${authSubtext}`}>Searching printings…</p> : null}
      {error ? <p className={`mt-3 ${authError}`}>{error}</p> : null}

      {hits.length && !selected ? (
        <ul className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.scryfallId}>
              <button
                type="button"
                onClick={() => {
                  setSelected(hit);
                  setHits([]);
                  setError(null);
                  setQuery(hit.name);
                }}
                className="flex w-full items-start gap-3 rounded-md border border-[var(--line-subtle)] bg-[var(--ink-850)] p-2 text-left hover:border-[var(--accent-lo)]"
              >
                {hit.imageNormal ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hit.imageNormal}
                    alt=""
                    className="h-40 w-[7.15rem] shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-40 w-[7.15rem] shrink-0 rounded bg-[var(--ink-750)]" />
                )}
                <span className="min-w-0 text-left">
                  <span className="block text-sm leading-snug text-[var(--text-hi)]">{hit.name}</span>
                  <span className="mt-1 block text-xs leading-snug text-[var(--text-lo)]">
                    {printingMeta(hit)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--ink-850)] p-3">
          <div className="flex items-start gap-3">
            {selected.imageNormal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.imageNormal}
                alt={selected.name}
                className="h-48 w-[8.6rem] shrink-0 rounded object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-hi)]">{selected.name}</p>
              <p className="mt-1 text-xs text-[var(--text-lo)]">{printingMeta(selected)}</p>
              {selected.typeLine ? (
                <p className="mt-1 text-xs text-[var(--text)]">{selected.typeLine}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              className={authButton}
              disabled={saving}
              onClick={() => void addSelected()}
            >
              {saving ? "Adding…" : "Add to collection"}
            </button>
            <button
              type="button"
              className={authButtonSecondary}
              disabled={saving}
              onClick={() => {
                setSelected(null);
                searchRef.current?.focus();
              }}
            >
              Choose a different printing
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
