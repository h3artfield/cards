"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CommanderPickerV1 } from "./CommanderPickerV1";
import type { CommanderPickResultV1 } from "./CommanderPickerV1";
import { CustomerDeckNavV1 } from "./CustomerDeckNavV1";
import { ProfessorMtgPageShell } from "./ProfessorMtgPageShell";

/**
 * The fork in the road: have the Professor build a deck, or build one yourself.
 *
 * Until now the only way into the deck editor was to finish a Professor build,
 * which made "I already know what I want to play" an unsupported case. Both
 * paths land in the same editor and produce the same kind of deck; the
 * difference is only who chooses the 99.
 *
 * A pasted list is offered alongside the commander rather than as a separate
 * mode. Someone importing an export from Moxfield has already named their
 * commander inside the file, so the picker is optional in that case and the
 * server infers it — asking twice would be a step that exists purely to satisfy
 * the data model.
 */
export function NewDeckApp({ slug }: { slug: string }) {
  const router = useRouter();

  const [commander, setCommander] = useState<CommanderPickResultV1 | null>(null);
  const [deckName, setDeckName] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [decklist, setDecklist] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pasted = decklist.trim();
  const canStart = Boolean(commander) || pasted.length > 0;

  async function start() {
    if (!canStart || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(slug)}/professor/deck-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commanderName: commander?.name,
          deckName: deckName.trim() || undefined,
          decklist: pasted || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { deck?: { deckId: string }; error?: string }
        | null;

      if (!res.ok || !data?.deck) {
        setError(data?.error ?? "We could not start that deck. Please try again.");
        return;
      }
      router.push(`/s/${encodeURIComponent(slug)}/decks/${encodeURIComponent(data.deck.deckId)}`);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProfessorMtgPageShell>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <CustomerDeckNavV1 slug={slug} />

        <h1 className="professor-mtg-title mt-4 text-3xl">Start a deck</h1>
        <p className="professor-mtg-muted mt-2 text-sm">
          Have the Professor build one for you, or pick the cards yourself.
        </p>

        <Link
          href={`/s/${encodeURIComponent(slug)}/inventory/professor`}
          className="professor-mtg-card mt-8 flex items-center justify-between gap-4 px-5 py-4 no-underline transition hover:border-[var(--mtg-gold)]/60"
        >
          <span className="min-w-0">
            <span className="professor-mtg-label block">Let the Professor build it</span>
            <span className="professor-mtg-muted mt-1 block text-[12px] leading-snug">
              Choose a commander, a bracket and a playstyle, and get a graded 100-card deck with
              the reasoning behind every card.
            </span>
          </span>
          <span className="professor-mtg-muted shrink-0 text-lg">→</span>
        </Link>

        <div className="professor-mtg-card mt-4 px-5 py-5">
          <p className="professor-mtg-label">Build it myself</p>
          <p className="professor-mtg-muted mt-1 text-[12px] leading-snug">
            Search for cards and add them one at a time, or paste a list you already have. You can
            check the bracket whenever the deck is finished.
          </p>

          <label className="professor-mtg-label mt-6 block" htmlFor="new-deck-commander">
            Commander
          </label>
          <div className="mt-2">
            <CommanderPickerV1
              slug={slug}
              value={commander}
              inputId="new-deck-commander"
              onChange={(picked) => {
                setCommander(picked);
                if (picked) setError(null);
              }}
            />
          </div>

          <label className="professor-mtg-label mt-6 block" htmlFor="new-deck-name">
            Deck name <span className="professor-mtg-muted font-normal">— optional</span>
          </label>
          <input
            id="new-deck-name"
            type="text"
            value={deckName}
            maxLength={120}
            placeholder={commander ? commander.name : "Named after your commander by default"}
            onChange={(e) => setDeckName(e.target.value)}
            className="professor-mtg-input mt-2 w-full px-4 py-3 text-sm"
          />

          <div className="mt-6 border-t border-[var(--mtg-stone-border)] pt-5">
            {pasteOpen ? (
              <>
                <label className="professor-mtg-label block" htmlFor="new-deck-paste">
                  Paste a list
                </label>
                <p className="professor-mtg-muted mt-1 text-[11px] leading-relaxed">
                  Exports from Moxfield, Archidekt and Arena all work, as does a plain list of
                  names. Anything we cannot match is still added, and flagged in the deck.
                </p>
                <textarea
                  id="new-deck-paste"
                  value={decklist}
                  rows={10}
                  spellCheck={false}
                  placeholder={"1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…"}
                  onChange={(e) => setDecklist(e.target.value)}
                  className="professor-mtg-input mt-3 w-full px-4 py-3 font-mono text-[12px] leading-relaxed"
                />
              </>
            ) : (
              <button
                type="button"
                className="professor-mtg-link text-xs"
                onClick={() => setPasteOpen(true)}
              >
                Or paste a list you already have
              </button>
            )}
          </div>

          {error ? <p className="mt-4 text-[12px] text-[var(--bad)]">{error}</p> : null}

          <button
            type="button"
            disabled={!canStart || busy}
            onClick={() => void start()}
            className="professor-mtg-btn mt-6 w-full px-6 py-4 text-sm"
          >
            {busy ? "Starting…" : "Start deck"}
          </button>
          {!canStart ? (
            <p className="professor-mtg-muted mt-2 text-center text-[11px]">
              Pick a commander, or paste a list that names one.
            </p>
          ) : null}
        </div>
      </div>
    </ProfessorMtgPageShell>
  );
}
