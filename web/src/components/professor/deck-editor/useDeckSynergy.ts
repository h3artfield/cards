"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deckEditorKeyQueryV1 } from "./deck-key-v1";
import type { DeckEditorKeyV1 } from "./deck-key-v1";
import type { DeckEditorSynergy } from "./types";

/**
 * Synergy links for the open deck, fetched the first time a player asks.
 *
 * Deliberately lazy: working this out server-side reads the verified-combo
 * detector tables, and most visits to the editor are to change a card rather
 * than to study how the deck fits together. Refetches when the deck revision
 * moves, because adding a combo piece should change the answer.
 */
export function useDeckSynergy({
  slug,
  buildId,
  deckId,
  revision,
}: DeckEditorKeyV1 & {
  slug: string;
  revision: number | null;
}) {
  const [synergy, setSynergy] = useState<DeckEditorSynergy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const loadedRevision = useRef<number | null>(null);

  const enable = useCallback(() => setEnabled(true), []);

  useEffect(() => {
    if (!enabled || revision == null) return;
    if (loadedRevision.current === revision) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    const url =
      `/api/store/${encodeURIComponent(slug)}/professor/deck-editor/synergy` +
      `?${deckEditorKeyQueryV1({ buildId, deckId })}`;
    fetch(url)
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | (DeckEditorSynergy & { error?: string })
          | null;
        if (cancelled) return;
        if (!response.ok || !data || data.error) {
          setError(data?.error ?? "Could not work out this deck's synergies");
          return;
        }
        loadedRevision.current = revision;
        setSynergy({
          linksByCardKey: data.linksByCardKey ?? {},
          comboCount: data.comboCount ?? 0,
          semanticUnavailable: Boolean(data.semanticUnavailable),
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not work out this deck's synergies");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildId, deckId, enabled, revision, slug]);

  return { synergy, loading, error, enabled, enable };
}
