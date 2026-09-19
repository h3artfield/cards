"use client";

import { useEffect, useState } from "react";
import { CollectionPrintingPicker } from "@/components/collection/CollectionPrintingPicker";
import { apiFetch } from "@/lib/api-client";
import { authButtonSecondary, authError, authSubtext } from "@/lib/customer-auth-ui";
import type { CollectionImportCandidate } from "@/lib/collection/collection-import-parse";
import type { CollectionCard } from "@/lib/types";

export function CollectionChangePrinting({
  slug,
  card,
  onChanged,
}: {
  slug: string;
  card: CollectionCard;
  onChanged: (card: CollectionCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<CollectionImportCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<{ results?: CollectionImportCandidate[] }>(
      `/api/store/${encodeURIComponent(slug)}/collection/card-search?q=${encodeURIComponent(
        `!"${card.displayName}"`,
      )}&limit=80`,
    )
      .then((data) => {
        if (!active) return;
        setHits(data.results ?? []);
        if (!data.results?.length) setError("No other printings found.");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load printings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.displayName, open, slug]);

  async function pick(scryfallId: string) {
    setSaving(scryfallId);
    setError(null);
    try {
      const data = await apiFetch<{ card: CollectionCard }>(
        `/api/store/${encodeURIComponent(slug)}/collection/${encodeURIComponent(card.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ scryfallId }),
        },
      );
      onChanged(data.card);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that printing");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs text-neutral-400 underline underline-offset-4"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Cancel" : "Change printing"}
      </button>
      {open ? (
        <div className="mt-2 w-full border border-neutral-800 bg-neutral-950 p-3">
          <p className={authSubtext}>
            Pick the set and art for {card.displayName}.
          </p>
          {loading ? <p className={`mt-2 ${authSubtext}`}>Loading printings…</p> : null}
          {error ? <p className={`mt-2 ${authError}`}>{error}</p> : null}
          {!loading ? (
            <CollectionPrintingPicker
              candidates={hits.filter((hit) => hit.scryfallId !== card.scryfallId)}
              busyId={saving}
              onPick={(id) => void pick(id)}
            />
          ) : null}
          <button
            type="button"
            className={`mt-2 ${authButtonSecondary}`}
            onClick={() => setOpen(false)}
          >
            Keep current printing
          </button>
        </div>
      ) : null}
    </div>
  );
}
