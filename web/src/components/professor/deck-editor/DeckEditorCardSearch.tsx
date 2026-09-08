"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DECK_BOARD_LABELS_V1, DECK_BOARDS_V1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckBoardV1 } from "@/lib/professor-deck-editor/types-v1";
import { deckEditorKeyQueryV1 } from "./deck-key-v1";
import type { DeckEditorKeyV1 } from "./deck-key-v1";
import { ManaCost } from "./ManaCost";
import type { DeckEditorSearchHit, DeckEditorSearchResponse } from "./types";

const DEBOUNCE_MS = 180;
const MIN_QUERY = 2;

/**
 * Add-card search.
 *
 * Two decisions worth naming. The list stays open after an add, because a
 * player fixing a mana base adds six lands in a row and closing the results
 * each time would make them retype the query. And a card that cannot legally go
 * in the deck is still listed, greyed, with the reason — someone searching
 * "Rhystic Study" in a mono-green deck has made a mistake, and saying so
 * teaches them something an empty list does not.
 */
export function DeckEditorCardSearch({
  slug,
  buildId,
  deckId,
  boardOf,
  onAdd,
  onMove,
  disabled,
  inputRef,
}: DeckEditorKeyV1 & {
  slug: string;
  /** The live deck's answer for where a card sits, which beats the server's. */
  boardOf: (hit: DeckEditorSearchHit) => DeckBoardV1 | null;
  onAdd: (hit: DeckEditorSearchHit, board: DeckBoardV1) => void;
  onMove: (hit: DeckEditorSearchHit, board: DeckBoardV1) => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState<DeckBoardV1>("mainboard");
  const [result, setResult] = useState<DeckEditorSearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const listId = useId();
  const localRef = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? localRef;
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setResult(null);
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      const url =
        `/api/store/${slug}/professor/deck-editor/search` +
        `?${deckEditorKeyQueryV1({ buildId, deckId })}&q=${encodeURIComponent(trimmed)}`;
      void fetch(url, { signal: controller.signal })
        .then(async (res) => (res.ok ? ((await res.json()) as DeckEditorSearchResponse) : null))
        .then((data) => {
          if (controller.signal.aborted) return;
          setResult(data);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          /* aborted or offline: the previous results stay on screen */
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [buildId, deckId, query, slug]);

  // Closes on an outside click. Focus loss alone is not enough, because
  // clicking a result inside the list briefly moves focus out of the input.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const hits = result?.hits ?? [];

  const commit = useCallback(
    (hit: DeckEditorSearchHit) => {
      const current = boardOf(hit);
      if (current === board) return;
      if (current) onMove(hit, board);
      else onAdd(hit, board);
    },
    [board, boardOf, onAdd, onMove],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) {
      if (event.key === "ArrowDown" && hits.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[active];
      if (hit) commit(hit);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full sm:w-[26rem]">
      <div className="flex items-stretch gap-2">
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          className="professor-mtg-input min-w-0 flex-1 px-3 py-2 text-sm"
          placeholder="Add a card by name…"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (hits.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <label className="sr-only" htmlFor={`${listId}-board`}>
          Board to add to
        </label>
        <select
          id={`${listId}-board`}
          className="professor-mtg-input shrink-0 px-2 py-2 text-xs"
          value={board}
          disabled={disabled}
          onChange={(event) => setBoard(event.target.value as DeckBoardV1)}
        >
          {DECK_BOARDS_V1.map((option) => (
            <option key={option} value={option}>
              {DECK_BOARD_LABELS_V1[option]}
            </option>
          ))}
        </select>
      </div>

      {open && result ? (
        <div className="professor-mtg-pop absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-[22rem] overflow-y-auto">
          <ul id={listId} role="listbox" aria-label="Card search results">
            {hits.map((hit, index) => (
              <SearchHitRow
                key={hit.oracleId}
                id={`${listId}-${index}`}
                hit={hit}
                board={board}
                currentBoard={boardOf(hit)}
                active={index === active}
                onHover={() => setActive(index)}
                onSelect={() => commit(hit)}
              />
            ))}
          </ul>
          {hits.length === 0 ? (
            <p className="professor-mtg-muted px-3 py-3 text-xs">
              No card matches “{result.query}”.
            </p>
          ) : result.totalMatches > hits.length ? (
            <p className="professor-mtg-muted border-t border-[var(--mtg-stone-border)] px-3 py-2 text-[11px]">
              Showing {hits.length} of {result.totalMatches} matches — keep typing to narrow it down.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="professor-mtg-muted mt-1 h-4 text-[11px]" aria-live="polite">
        {busy && query.trim().length >= MIN_QUERY ? "Searching…" : ""}
      </p>
    </div>
  );
}

function SearchHitRow({
  id,
  hit,
  board,
  currentBoard,
  active,
  onHover,
  onSelect,
}: {
  id: string;
  hit: DeckEditorSearchHit;
  board: DeckBoardV1;
  currentBoard: DeckBoardV1 | null;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const offColor = hit.offColorPips.length > 0;
  const alreadyHere = currentBoard === board;

  // Off-colour and banned cards are offered anyway. Legality is reported on the
  // deck, where it can be fixed, rather than enforced at the point of adding —
  // a player mid-swap may well want the card in Considering while they think.
  const blocked = alreadyHere;

  return (
    <li role="option" aria-selected={active} aria-disabled={blocked}>
      <button
        type="button"
        id={id}
        // Focus stays in the input so `aria-activedescendant` drives the screen
        // reader; taking these out of the tab order keeps the two in step.
        tabIndex={-1}
        className={`professor-mtg-pop-item ${active ? "professor-mtg-pop-item--active" : ""}`}
        disabled={blocked}
        onMouseEnter={onHover}
        onClick={onSelect}
      >
        <span className="flex items-baseline gap-2">
          <span className="professor-mtg-card-name min-w-0 flex-1 truncate">{hit.name}</span>
          <ManaCost cost={hit.manaCost} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="professor-mtg-muted min-w-0 flex-1 truncate text-[11px]">
            {hit.typeLine}
          </span>
          {hit.inStock ? (
            <span className="professor-mtg-chip professor-mtg-chip--in-stock">In stock</span>
          ) : null}
          {!hit.commanderLegal ? (
            <span className="professor-mtg-chip professor-mtg-chip--warn" title="Banned or not legal in Commander">
              Not legal
            </span>
          ) : null}
          {offColor ? (
            <span
              className="professor-mtg-chip professor-mtg-chip--warn"
              title={`Adds ${hit.offColorPips.join("")} to the deck, which is outside your commander's colour identity`}
            >
              Off-colour {hit.offColorPips.join("")}
            </span>
          ) : null}
          {currentBoard ? (
            <span className="professor-mtg-chip professor-mtg-chip--game-changer">
              {alreadyHere
                ? `Already on ${DECK_BOARD_LABELS_V1[currentBoard]}`
                : `On ${DECK_BOARD_LABELS_V1[currentBoard]} — move`}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
