"use client";

import { useEffect, useRef, useState } from "react";
import { CollectionPrintingPicker } from "@/components/collection/CollectionPrintingPicker";
import { apiFetch } from "@/lib/api-client";
import { authError, authInput, authSubtext } from "@/lib/customer-auth-ui";
import type { CollectionImportCandidate } from "@/lib/collection/collection-import-parse";
import type { CollectionFinish } from "@/lib/collection/collection-finish";
import type { CollectionCard } from "@/lib/types";

export function CollectionCardSearch({
  slug,
  onAdded,
}: {
  slug: string;
  onAdded: (card: CollectionCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CollectionImportCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
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

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(q);
    }, 280);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function runSearch(q: string) {
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<{ results?: CollectionImportCandidate[] }>(
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

  async function addPrinting(scryfallId: string, finish: CollectionFinish) {
    setSaving(`${scryfallId}:${finish}`);
    setError(null);
    try {
      const data = await apiFetch<{ card: CollectionCard }>(
        `/api/store/${encodeURIComponent(slug)}/collection`,
        {
          method: "POST",
          body: JSON.stringify({ scryfallId, finish }),
        },
      );
      onAdded(data.card);
      setHits([]);
      setQuery("");
      searchRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that card");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-md border border-[var(--line-subtle)] bg-[var(--ink-800)] p-4">
      <p className="text-sm font-semibold text-[var(--text-hi)]">Add by name</p>
      <p className={`mt-1 ${authSubtext}`}>
        Type the card, then pick the set, art, and foil. That printing goes in
        your binder immediately.
      </p>

      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setError(null);
        }}
        placeholder="Card name, e.g. Lightning Bolt"
        className={authInput}
        aria-label="Search for a card to add"
      />

      {searching ? <p className={`mt-3 ${authSubtext}`}>Searching printings…</p> : null}
      {error ? <p className={`mt-3 ${authError}`}>{error}</p> : null}

      {hits.length ? (
        <CollectionPrintingPicker
          candidates={hits}
          busyId={saving}
          onPick={(id, finish) => void addPrinting(id, finish)}
        />
      ) : null}
    </div>
  );
}
