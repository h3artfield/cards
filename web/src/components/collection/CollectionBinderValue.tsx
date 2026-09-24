"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { CollectionGame } from "@/lib/collection/collection-game";
import type { CollectionValuePayload } from "@/lib/collection/collection-price";
import { authError, authSubtext } from "@/lib/customer-auth-ui";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

export function CollectionBinderValue({
  slug,
  game,
}: {
  slug: string;
  game: CollectionGame;
}) {
  const [data, setData] = useState<CollectionValuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<CollectionValuePayload>(
      `/api/store/${encodeURIComponent(slug)}/collection/value?game=${encodeURIComponent(game)}`,
    )
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load collection value");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [game, slug]);

  const coverage =
    data && data.cardCount
      ? data.pricedCards === data.cardCount
        ? ` · ${data.cardCount} cards`
        : ` · ${data.pricedCards} of ${data.cardCount} cards`
      : "";

  return (
    <div className="mt-8 rounded-lg border border-neutral-800 bg-[var(--ink-900)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Binder value
      </p>
      {loading ? <p className={`mt-3 ${authSubtext}`}>Adding up your binder…</p> : null}
      {error ? <p className={`mt-3 ${authError}`}>{error}</p> : null}
      {data && !loading ? (
        <>
          <p className="mt-2 text-3xl font-semibold text-white">
            {money(data.tcgLowTotal)}
          </p>
          <p className={`mt-1 ${authSubtext}`}>
            Lowest listings today{coverage}
          </p>
        </>
      ) : null}
    </div>
  );
}
