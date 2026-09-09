"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";

/**
 * Which deck a player is bringing to a Commander event.
 *
 * Only decks with a current measured bracket can be offered in the dropdown,
 * because the bracket is what lets the shop seat balanced pods. When nothing
 * qualifies yet, this component's job is to send them somewhere useful — not
 * to show a disabled Save button that looks broken.
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

  const store = encodeURIComponent(slug);
  const myDecksHref = `/s/${store}/decks`;

  if (decks === null) {
    return <p className="text-xs text-gray-500">Loading your decks…</p>;
  }

  const measured = decks.filter((d) => d.deckId && d.measuredBracket !== null);
  const ready = measured.filter((d) => !d.measuredBracketStale);
  const stale = measured.filter((d) => d.measuredBracketStale);
  const needsBracket = decks.filter((d) => !d.measuredBracket);

  if (ready.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-700">
          Registering a deck requires a measured bracket — open a deck in My decks, add your
          list, then use <span className="font-semibold">Check bracket</span> once you have
          99 cards.
        </p>

        {needsBracket.length ? (
          <ul className="space-y-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
            {needsBracket.slice(0, 6).map((deck) => (
              <li key={deck.key}>
                <Link href={deck.href} className="font-medium text-indigo-600 hover:underline">
                  {deck.deckName}
                </Link>
                <span className="text-gray-500"> · needs a bracket check</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">You do not have any decks here yet.</p>
        )}

        <Link
          href={myDecksHref}
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-indigo-700"
        >
          Open My decks
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Deck you&apos;re bringing</span>

      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">Choose a deck…</option>
        {ready.map((deck) => (
          <option key={deck.key} value={deck.deckId ?? ""}>
            {deck.deckName} · {deck.commanderName} · bracket {deck.measuredBracket}
          </option>
        ))}
      </select>

      <p className="text-xs text-gray-500">
        The shop sees your commander and bracket so it can build even pods — not your decklist.
      </p>

      {stale.length ? (
        <p className="text-xs text-gray-500">
          {stale.length === 1
            ? `${stale[0].deckName} changed since its bracket was measured — open it in My decks and check bracket again.`
            : `${stale.length} decks need a fresh bracket check before they can be registered.`}{" "}
          <Link href={myDecksHref} className="font-medium text-indigo-600 hover:underline">
            My decks
          </Link>
        </p>
      ) : null}

      {!value ? (
        <Link
          href={myDecksHref}
          className="inline-block text-xs font-medium text-indigo-600 hover:underline"
        >
          Manage decks in My decks
        </Link>
      ) : null}
    </div>
  );
}
