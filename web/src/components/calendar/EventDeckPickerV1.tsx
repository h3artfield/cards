"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { eventDeckPickerLabelV1, deckListPrimaryNameV1 } from "@/lib/professor-deck-editor/deck-list-display-v1";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import {
  authButton,
  authInput,
  authLabel,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";

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
  requiredBracket,
  value,
  onChange,
}: {
  slug: string;
  /** When set, only decks at this bracket appear in the dropdown. */
  requiredBracket?: number | null;
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
    return <p className={`text-xs ${authSubtext}`}>Loading your decks…</p>;
  }

  const measured = decks.filter((d) => d.registrationBracket !== null);
  const readyAll = measured.filter((d) => !d.registrationBracketStale);
  const ready =
    requiredBracket != null
      ? readyAll.filter((d) => d.registrationBracket === requiredBracket)
      : readyAll;
  const wrongBracket =
    requiredBracket != null
      ? readyAll.filter((d) => d.registrationBracket !== requiredBracket)
      : [];
  const stale = measured.filter((d) => d.registrationBracketStale);
  const needsBracket = decks.filter((d) => d.registrationBracket === null);

  if (ready.length === 0) {
    return (
      <div className="space-y-3">
        <p className={`text-xs ${authSubtext}`}>
          {requiredBracket != null ? (
            <>
              This event is <span className="font-semibold text-[var(--text-hi)]">bracket {requiredBracket}</span>.
              You need a deck that measures at bracket {requiredBracket} to register.
            </>
          ) : (
            <>
              Registering a deck requires a bracket. Professor-built decks already have
              one unless you have edited them. Hand-built decks need{" "}
              <span className="font-semibold text-[var(--text-hi)]">Check bracket</span> once you reach 99 cards.
            </>
          )}
        </p>

        {wrongBracket.length ? (
          <ul className="space-y-1 rounded-lg border border-[var(--line-subtle)] bg-[var(--ink-800)] px-3 py-2 text-xs">
            {wrongBracket.slice(0, 6).map((deck) => (
              <li key={deck.key}>
                <Link href={deck.href} className={authLink}>
                  {deckListPrimaryNameV1(deck)}
                </Link>
                <span className="text-[var(--text-lo)]">
                  {" "}
                  · bracket {deck.registrationBracket} (not eligible)
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {needsBracket.length ? (
          <ul className="space-y-1 rounded-lg border border-[var(--line-subtle)] bg-[var(--ink-800)] px-3 py-2 text-xs">
            {needsBracket.slice(0, 6).map((deck) => (
              <li key={deck.key}>
                <Link href={deck.href} className={authLink}>
                  {deckListPrimaryNameV1(deck)}
                </Link>
                <span className="text-[var(--text-lo)]"> · needs a bracket check</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-xs ${authSubtext}`}>You do not have any decks here yet.</p>
        )}

        <Link href={myDecksHref} className={`${authButton} no-underline`}>
          Open My decks
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className={authLabel}>Deck you&apos;re bringing</span>

      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={authInput}
      >
        <option value="">Choose a deck…</option>
        {ready.map((deck) => (
          <option key={deck.key} value={deck.deckId ?? ""}>
            {eventDeckPickerLabelV1(deck)}
          </option>
        ))}
      </select>

      <p className={`text-xs ${authSubtext}`}>
        {requiredBracket != null
          ? `Only bracket ${requiredBracket} decks can be registered for this event.`
          : "The shop sees your commander and bracket so it can build even pods — not your decklist."}
      </p>

      {wrongBracket.length ? (
        <p className={`text-xs ${authSubtext}`}>
          {wrongBracket.length === 1
            ? `${deckListPrimaryNameV1(wrongBracket[0])} is bracket ${wrongBracket[0].registrationBracket} and cannot be used here.`
            : `${wrongBracket.length} of your decks are a different bracket and are hidden from this list.`}
        </p>
      ) : null}

      {stale.length ? (
        <p className={`text-xs ${authSubtext}`}>
          {stale.length === 1
            ? `${deckListPrimaryNameV1(stale[0])} changed since the Professor built it — check bracket again in My decks.`
            : `${stale.length} decks need a fresh bracket check before they can be registered.`}{" "}
          <Link href={myDecksHref} className={authLink}>
            My decks
          </Link>
        </p>
      ) : null}

      {!value ? (
        <Link href={myDecksHref} className={authLink}>
          Manage decks in My decks
        </Link>
      ) : null}
    </div>
  );
}
