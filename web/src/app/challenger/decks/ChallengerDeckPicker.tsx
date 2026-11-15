"use client";

import { useEffect, useState } from "react";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import {
  authButton,
  authContainer,
  authError,
  authHeading,
  authInput,
  authLabel,
  authLink,
  authPage,
  authSubtext,
} from "@/lib/customer-auth-ui";

const STORE = "the-game-lodge";
const BUILD = `/s/${STORE}/decks/new?from=challenger`;

function deckBracket(deck: CustomerDeckListEntryV1): number | null {
  return deck.registrationBracket ?? deck.measuredBracket ?? deck.requestedBracket;
}

function deckChoices(decks: CustomerDeckListEntryV1[]): CustomerDeckListEntryV1[] {
  const byId = new Map<string, CustomerDeckListEntryV1>();
  for (const deck of decks) {
    const prev = byId.get(deck.deckId);
    if (!prev || (deckBracket(prev) == null && deckBracket(deck) != null)) {
      byId.set(deck.deckId, deck);
    }
  }
  return [...byId.values()].sort((a, b) =>
    (a.commanderName || a.deckName).localeCompare(b.commanderName || b.deckName),
  );
}

function optionLabel(deck: CustomerDeckListEntryV1): string {
  const commander = deck.commanderName.trim();
  const name = deck.deckName.trim();
  const title =
    commander && name && name.length <= 42 && name.toLowerCase() !== commander.toLowerCase()
      ? `${commander} — ${name}`
      : commander || name;
  const bracket = deckBracket(deck);
  return bracket != null ? `${title} · Bracket ${bracket}` : `${title} · No bracket yet`;
}

export function ChallengerDeckPicker({ lobbyUrl }: { lobbyUrl: string | null }) {
  const [decks, setDecks] = useState<CustomerDeckListEntryV1[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [chosen, setChosen] = useState<{ name: string; bracket: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await fetch("/api/customers/me", { credentials: "include" });
        if (!active) return;
        if (!me.ok) {
          window.location.assign(`/challenger?next=${encodeURIComponent("/challenger/decks")}`);
          return;
        }
        const res = await fetch(`/api/store/${STORE}/decks`, { credentials: "include" });
        const data = (await res.json().catch(() => null)) as
          | { decks?: CustomerDeckListEntryV1[]; error?: string }
          | null;
        if (!active) return;
        if (!res.ok || !data?.decks) {
          setError(data?.error ?? "We could not load your decks.");
          setDecks([]);
          return;
        }
        setDecks(deckChoices(data.decks));
      } catch {
        if (!active) return;
        setError("We could not reach the server.");
        setDecks([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function choose(deckId: string) {
    const deck = decks?.find((row) => row.deckId === deckId);
    if (!deck) return;
    setBusy(true);
    setError(null);
    setChosen(null);
    try {
      const res = await fetch("/api/challenger/decks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: deck.deckId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; bracket?: number } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not submit this deck.");
        return;
      }
      const bracket = data?.bracket ?? deckBracket(deck) ?? 0;
      setChosen({
        name: deck.commanderName.trim() || deck.deckName,
        bracket,
      });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={authPage}>
      <div className={authContainer}>
        <h1 className={authHeading}>Select a deck</h1>
        <p className={`${authSubtext} mt-3`}>
          The deck you choose sets the bracket. A bracket 3 list plays in the bracket 3 queue.
        </p>

        {error ? <p className={`${authError} mt-6`}>{error}</p> : null}

        {chosen ? (
          <div className="mt-6">
            <p className="text-lg font-semibold text-[var(--text-hi)]">
              {chosen.name} plays at bracket {chosen.bracket}.
            </p>
            {lobbyUrl ? (
              <a className={`${authButton} mt-6 block`} href={lobbyUrl}>
                Back to the lobby
              </a>
            ) : null}
          </div>
        ) : null}

        {decks == null ? (
          <p className={`${authSubtext} mt-8`}>Loading your decks…</p>
        ) : decks.length === 0 ? (
          <div className="mt-8">
            <p className={authSubtext}>You do not have a deck yet.</p>
            <a className={`${authButton} mt-6 block`} href={BUILD}>
              Build a deck
            </a>
            <p className={`${authSubtext} mt-3`}>
              Import a list, build it by hand, or let the Professor build it.
            </p>
          </div>
        ) : (
          <label className={`${authLabel} mt-8`}>
            Deck
            <select
              className={authInput}
              value={selectedId}
              disabled={busy}
              onChange={(event) => {
                const deckId = event.target.value;
                setSelectedId(deckId);
                if (deckId) void choose(deckId);
              }}
            >
              <option value="">Select a deck</option>
              {decks.map((deck) => (
                <option key={deck.deckId} value={deck.deckId}>
                  {optionLabel(deck)}
                </option>
              ))}
            </select>
          </label>
        )}

        {decks && decks.length > 0 ? (
          <a className={`${authLink} mt-6 inline-block`} href={BUILD}>
            Build a deck
          </a>
        ) : null}
        {busy ? <p className={`${authSubtext} mt-4`}>Submitting…</p> : null}
      </div>
    </main>
  );
}
