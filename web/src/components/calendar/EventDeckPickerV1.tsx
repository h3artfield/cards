"use client";

import { useEffect, useState } from "react";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";

/**
 * Which deck a player is bringing to a Commander event.
 *
 * Only decks with a current measured bracket can be offered, because the
 * bracket is the entire point — it is what lets the shop seat balanced pods.
 * A deck measured before its last edit is deliberately shown as unavailable
 * with the reason, rather than hidden, so the fix is discoverable instead of
 * the deck just being mysteriously absent.
 */
export function EventDeckPickerV1({
  slug,
  value,
  onChange,
}: {
  slug: string;
  value: string | null;
  onChange: (deckId: string | null) => void;
}) {
  const [decks, setDecks] = useState<CustomerDeckListEntryV1[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/store/${encodeURIComponent(slug)}/decks`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((data: { decks?: CustomerDeckListEntryV1[] } | null) =>
        setDecks(data?.decks ?? []),
      )
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setDecks([]);
      });
    return () => controller.abort();
  }, [slug]);

  if (decks === null) return null;

  const measured = decks.filter((d) => d.deckId && d.measuredBracket !== null);
  const ready = measured.filter((d) => !d.measuredBracketStale);
  const stale = measured.filter((d) => d.measuredBracketStale);

  if (measured.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Check a deck&apos;s bracket in the deck editor and you can register it here, so the
        shop can seat you in a fair pod.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Deck you&apos;re bringing (optional)</span>

      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">Not saying yet</option>
        {ready.map((deck) => (
          <option key={deck.key} value={deck.deckId ?? ""}>
            {deck.deckName} · {deck.commanderName} · bracket {deck.measuredBracket}
          </option>
        ))}
      </select>

      <p className="text-xs text-gray-500">
        The shop sees your commander and bracket so it can build even pods. It does not see
        your decklist.
      </p>

      {stale.length ? (
        <p className="text-xs text-gray-500">
          {stale.length === 1
            ? `${stale[0].deckName} changed since its bracket was measured — check it again to register it.`
            : `${stale.length} decks changed since their brackets were measured. Check them again to register them.`}
        </p>
      ) : null}
    </div>
  );
}
