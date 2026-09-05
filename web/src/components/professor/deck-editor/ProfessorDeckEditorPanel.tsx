"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SOL_DIRECTED_DECK_DISPLAY_ORDER_V1,
  SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS,
} from "@/lib/deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import { tcgPriceForCardName } from "@/lib/deck-synthesis/professor-brew-scryfall-prices-v1";
import {
  DECK_BOARDS_V1,
  DECK_BOARD_LABELS_V1,
  deckMarkerIdV1,
} from "@/lib/professor-deck-editor/types-v1";
import type { DeckBoardV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckEditOpV1 } from "@/lib/professor-deck-editor/ops-v1";
import { CardNameHoverPreview } from "../CardNameHoverPreview";
import { DeckEditorCardRow } from "./DeckEditorCardRow";
import { DeckEditorCardSearch } from "./DeckEditorCardSearch";
import { DeckEditorStatus } from "./DeckEditorStatus";
import { DECK_EDITOR_GROUP_LABELS } from "./types";
import type { DeckEditorCard, DeckEditorGroupMode, DeckEditorSearchHit } from "./types";
import { useCardEnrichment } from "./useCardEnrichment";
import { useDeckEditor } from "./useDeckEditor";

const UNRECOGNISED_GROUP = "Not in the catalog";

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (character) => character.toUpperCase());
}

/**
 * The section a card belongs to under each grouping.
 *
 * Grouping by type reuses the read-only panel's rule, so a card lands in the
 * same section in both views. The other three exist because this deck knows
 * things a generic deck editor does not: the Professor's role for each card,
 * the customer's own markers, and the curve.
 */
function groupKeyFor(card: DeckEditorCard, mode: DeckEditorGroupMode, markerLabels: Map<string, string>): string {
  switch (mode) {
    case "type": {
      const category = card.display?.category;
      return category ? SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS[category] : UNRECOGNISED_GROUP;
    }
    case "role": {
      if (card.professor?.primaryRole?.trim()) return titleCase(card.professor.primaryRole);
      if (card.isLand) return "Mana base";
      return card.origin === "user" ? "Your additions" : "Unassigned";
    }
    case "marker": {
      const primary = card.primaryMarkerId ?? card.markerIds[0];
      if (primary) return markerLabels.get(primary) ?? primary;
      return "Unmarked";
    }
    case "mana": {
      if (card.isLand) return "Lands";
      const manaValue = card.display?.manaValue;
      if (manaValue == null) return "Unknown cost";
      if (manaValue >= 7) return "Mana value 7+";
      return `Mana value ${manaValue}`;
    }
  }
}

/**
 * Section order per grouping.
 *
 * Type follows the printed-card convention the deck panel and every deck site
 * uses. Mana value sorts numerically, since "Mana value 10" sorting before
 * "Mana value 2" is the classic way a curve view becomes unreadable. The rest
 * are sorted by size, largest first, because under those groupings the big
 * sections are the ones describing the deck.
 */
function sortGroups(mode: DeckEditorGroupMode, groups: Array<[string, DeckEditorCard[]]>) {
  if (mode === "type") {
    const order = new Map(
      SOL_DIRECTED_DECK_DISPLAY_ORDER_V1.map((category, index) => [
        SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS[category],
        index,
      ]),
    );
    return groups.sort(
      (a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99) || a[0].localeCompare(b[0]),
    );
  }
  if (mode === "mana") {
    const rank = (label: string) => {
      if (label === "Lands") return -1;
      if (label === "Unknown cost") return 100;
      if (label === "Mana value 7+") return 7;
      return Number(label.replace(/\D+/g, "")) || 0;
    };
    return groups.sort((a, b) => rank(a[0]) - rank(b[0]));
  }
  return groups.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

export function ProfessorDeckEditorPanel({
  slug,
  buildId,
}: {
  slug: string;
  buildId: string;
}) {
  const editor = useDeckEditor({ slug, buildId });
  const { payload, applyOps } = editor;

  const [board, setBoard] = useState<DeckBoardV1>("mainboard");
  const [groupMode, setGroupMode] = useState<DeckEditorGroupMode>("type");
  const [activeFacets, setActiveFacets] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const deck = payload?.deck ?? null;
  const cardNames = useMemo(
    () => (deck ? [deck.commander.name, ...deck.cards.map((card) => card.name)] : []),
    [deck],
  );
  const enrichment = useCardEnrichment(slug, cardNames);

  // Focus the add-card box from the keyboard, the way every deck site does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      const shortcut = (event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing);
      if (!shortcut) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const markerLabels = useMemo(
    () => new Map((deck?.markers ?? []).map((marker) => [marker.id, marker.label])),
    [deck?.markers],
  );

  const boardCounts = useMemo(() => {
    const counts: Record<DeckBoardV1, number> = { mainboard: 0, considering: 0, cut: 0 };
    for (const card of deck?.cards ?? []) counts[card.board] += card.copies;
    return counts;
  }, [deck?.cards]);

  const illegalByCardKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const violation of payload?.legality.violations ?? []) {
      if (violation.severity !== "illegal" || !violation.cardKey) continue;
      if (!map.has(violation.cardKey)) map.set(violation.cardKey, violation.message);
    }
    return map;
  }, [payload?.legality.violations]);

  const visibleCards = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (deck?.cards ?? [])
      .filter((card) => card.board === board)
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .filter((card) => {
        if (activeFacets.length === 0) return true;
        const ids = new Set([
          ...(card.derivedMarkers ?? []).map((marker) => marker.id),
          ...card.markerIds,
        ]);
        return activeFacets.some((facet) => ids.has(facet));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeFacets, board, deck?.cards, filter]);

  const groups = useMemo(() => {
    const buckets = new Map<string, DeckEditorCard[]>();
    for (const card of visibleCards) {
      const key = groupKeyFor(card, groupMode, markerLabels);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(card);
      else buckets.set(key, [card]);
    }
    return sortGroups(groupMode, [...buckets.entries()]);
  }, [groupMode, markerLabels, visibleCards]);

  const boardOf = (hit: DeckEditorSearchHit): DeckBoardV1 | null => {
    const match = deck?.cards.find(
      (card) =>
        (hit.oracleId && card.oracleId === hit.oracleId) ||
        card.name.toLowerCase() === hit.name.toLowerCase(),
    );
    return match?.board ?? null;
  };

  const move = (card: DeckEditorCard, destination: DeckBoardV1) => {
    applyOps([{ op: "moveCard", cardKey: card.cardKey, board: destination }], {
      undo: [{ op: "moveCard", cardKey: card.cardKey, board: card.board }],
    });
  };

  if (editor.loading && !payload) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="professor-mtg-muted text-sm italic">Opening your deck…</p>
      </div>
    );
  }

  if (editor.error || !payload || !deck) {
    return (
      <div className="px-5 py-8">
        <div className="professor-mtg-alert professor-mtg-alert--illegal mx-auto max-w-xl">
          <p className="professor-mtg-label text-[#f0a8a0]">Could not open the editor</p>
          <p className="mt-1.5 text-[12px] text-[#f0d0cc]">
            {editor.error ?? "This deck is not available to edit."}
          </p>
          <button
            type="button"
            className="professor-mtg-btn mt-3 px-3 py-1.5 text-[11px]"
            onClick={editor.reload}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const facets = payload.markerFacets;

  return (
    <div className="relative">
      <div className="border-b border-[var(--mtg-stone-border)] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <label className="professor-mtg-label" htmlFor="deck-editor-name">
              Deck name
            </label>
            <input
              id="deck-editor-name"
              className="professor-mtg-input mt-1.5 w-full px-2.5 py-1.5 text-sm sm:w-80"
              value={nameDraft ?? deck.deckName}
              maxLength={120}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                const next = (nameDraft ?? "").trim();
                setNameDraft(null);
                if (next && next !== deck.deckName) {
                  applyOps([{ op: "renameDeck", deckName: next }]);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setNameDraft(null);
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <DeckEditorCardSearch
            slug={slug}
            buildId={buildId}
            inputRef={searchRef}
            boardOf={boardOf}
            onAdd={(hit, destination) =>
              applyOps([
                {
                  op: "addCard",
                  oracleId: hit.oracleId,
                  name: hit.name,
                  board: destination,
                  isLand: hit.isLand,
                },
              ])
            }
            onMove={(hit, destination) => {
              const card = deck.cards.find(
                (candidate) =>
                  (hit.oracleId && candidate.oracleId === hit.oracleId) ||
                  candidate.name.toLowerCase() === hit.name.toLowerCase(),
              );
              if (card) move(card, destination);
            }}
          />
        </div>
      </div>

      <div className="professor-mtg-tabs px-4 sm:px-5">
        {DECK_BOARDS_V1.map((option) => (
          <button
            key={option}
            type="button"
            className={`professor-mtg-tab ${option === board ? "professor-mtg-tab--active" : ""}`}
            aria-current={option === board}
            onClick={() => setBoard(option)}
          >
            {DECK_BOARD_LABELS_V1[option]}
            <span className="professor-mtg-tab-count">{boardCounts[option]}</span>
          </button>
        ))}
      </div>

      <div className="professor-mtg-panel-status px-4 py-2 sm:px-5">
        <p className="professor-mtg-muted text-[10px]">
          Click a card name for the Professor&rsquo;s reasoning · green = shop stock · hover a row
          for its actions · press / to add a card
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--mtg-stone-border)] px-4 py-3 sm:px-5">
        <label className="professor-mtg-label text-[10px]" htmlFor="deck-editor-group">
          Group by
        </label>
        <select
          id="deck-editor-group"
          className="professor-mtg-input px-2 py-1 text-xs"
          value={groupMode}
          onChange={(event) => setGroupMode(event.target.value as DeckEditorGroupMode)}
        >
          {(Object.keys(DECK_EDITOR_GROUP_LABELS) as DeckEditorGroupMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {DECK_EDITOR_GROUP_LABELS[mode]}
            </option>
          ))}
        </select>

        <input
          type="search"
          className="professor-mtg-input w-40 px-2 py-1 text-xs"
          placeholder="Filter this board…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />

        {facets.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {facets.slice(0, 12).map((facet) => {
              const on = activeFacets.includes(facet.id);
              return (
                <button
                  key={facet.id}
                  type="button"
                  aria-pressed={on}
                  className={`professor-mtg-chip professor-mtg-chip-btn ${on ? "professor-mtg-chip-btn--on" : ""}`}
                  onClick={() =>
                    setActiveFacets((current) =>
                      on ? current.filter((id) => id !== facet.id) : [...current, facet.id],
                    )
                  }
                >
                  {facet.label} {facet.count}
                </button>
              );
            })}
            {activeFacets.length > 0 ? (
              <button
                type="button"
                className="professor-mtg-link text-[10px]"
                onClick={() => setActiveFacets([])}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <DeckEditorStatus
          legality={payload.legality}
          editedByUser={deck.editedByUser}
          hasBaseline={deck.baselineCards.length > 0}
          stale={editor.saving}
          onRevert={() => applyOps([{ op: "revertToBaseline" }])}
        />
      </div>

      {visibleCards.length === 0 ? (
        <p className="professor-mtg-muted px-5 pb-8 text-center text-sm italic">
          {boardCounts[board] > 0
            ? "No cards on this board match that filter."
            : board === "considering"
              ? "Nothing here yet. Considering is for cards you are weighing up — move one here from the deck, or add one with the search box."
              : board === "cut"
                ? "Nothing cut yet. Cards you cut keep the Professor’s reasoning, so you can always put them back."
                : "This board is empty."}
        </p>
      ) : (
        // CSS columns rather than a grid: sections vary in height, and a grid
        // would leave a tall Creatures section sitting next to a wall of space.
        <div className="columns-1 gap-6 px-4 pb-6 sm:px-5 md:columns-2 xl:columns-3">
          {/* The commander is stored outside the card list, because it is the one
              card in the deck that cannot be swapped here — changing it would
              invalidate the whole build. It is still shown, since a deck editor
              that omits the commander looks like it has lost it. */}
          {board === "mainboard" && !filter.trim() && activeFacets.length === 0 ? (
            <section className="mb-5 break-inside-avoid">
              <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-[var(--mtg-stone-border)] pb-1.5">
                <h3 className="professor-mtg-label text-[12px]">Commander</h3>
                <span className="professor-mtg-muted text-xs tabular-nums">1</span>
              </div>
              <div className="professor-mtg-card-row flex items-center gap-2 py-1.5">
                <span className="professor-mtg-muted w-4 shrink-0 text-right text-[11px] tabular-nums">
                  1
                </span>
                <CardNameHoverPreview
                  name={deck.commander.name}
                  imageUrl={enrichment.imageUrls[deck.commander.name]}
                  inStock={Boolean(enrichment.inventoryByName[deck.commander.name]?.quantity)}
                  className="min-w-0 shrink"
                />
                <span className="flex-1" />
                <span className="professor-mtg-muted text-[10px]">fixed</span>
              </div>
            </section>
          ) : null}
          {groups.map(([label, cards]) => (
            <section key={label} className="mb-5 break-inside-avoid">
              <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-[var(--mtg-stone-border)] pb-1.5">
                <h3 className="professor-mtg-label text-[12px]">{label}</h3>
                <span className="professor-mtg-muted text-xs tabular-nums">
                  {cards.reduce((sum, card) => sum + card.copies, 0)}
                </span>
              </div>
              {cards.map((card) => (
                <DeckEditorCardRow
                  key={card.cardKey}
                  card={card}
                  markers={deck.markers}
                  imageUrl={enrichment.imageUrls[card.name]}
                  inventory={enrichment.inventoryByName[card.name]}
                  tcgPrice={tcgPriceForCardName(enrichment.tcgPricesByName, card.name)}
                  illegalReason={illegalByCardKey.get(card.cardKey)}
                  onMove={(destination) => move(card, destination)}
                  onRemove={() =>
                    applyOps([{ op: "removeCard", cardKey: card.cardKey }], {
                      // Only user additions can be removed, so re-adding the
                      // card restores it exactly. Its markers have to be put
                      // back by hand, hence the second half of the batch.
                      undo: [
                        {
                          op: "addCard",
                          oracleId: card.oracleId,
                          name: card.name,
                          board: card.board,
                          copies: card.copies,
                          isLand: card.isLand,
                        },
                        ...card.markerIds.map((markerId) => ({
                          op: "assignMarker" as const,
                          cardKey: card.cardKey,
                          markerId,
                        })),
                      ],
                    })
                  }
                  onSetCopies={(copies) =>
                    applyOps([{ op: "setCopies", cardKey: card.cardKey, copies }], {
                      undo: [{ op: "setCopies", cardKey: card.cardKey, copies: card.copies }],
                    })
                  }
                  onToggleMarker={(markerId, assign) =>
                    applyOps([
                      assign
                        ? { op: "assignMarker", cardKey: card.cardKey, markerId }
                        : { op: "unassignMarker", cardKey: card.cardKey, markerId },
                    ])
                  }
                  onCreateAndAssignMarker={(markerLabel, scope) => {
                    // The id is derived, not returned, so it has to be computed
                    // with the same function the reducer uses — otherwise the
                    // assignment half of the batch names a marker that the
                    // create half did not make.
                    const ops: DeckEditOpV1[] = [
                      { op: "createMarker", label: markerLabel, scope },
                      {
                        op: "assignMarker",
                        cardKey: card.cardKey,
                        markerId: deckMarkerIdV1(markerLabel, scope),
                      },
                    ];
                    applyOps(ops);
                  }}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      <DeckEditorToast editor={editor} />
    </div>
  );
}

/**
 * Save state and the last reversible change.
 *
 * Errors stay until dismissed; a successful save clears itself, because a
 * confirmation that needs acknowledging is worse than no confirmation.
 */
function DeckEditorToast({ editor }: { editor: ReturnType<typeof useDeckEditor> }) {
  const { notice, saving, dismissNotice, applyOps } = editor;

  useEffect(() => {
    if (!notice || notice.kind !== "info") return;
    const timer = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(timer);
  }, [notice, dismissNotice]);

  if (!notice && !saving) return null;

  return (
    <div className="pointer-events-none sticky bottom-3 z-30 flex justify-end px-4 sm:px-5">
      <div
        role="status"
        aria-live="polite"
        className={`professor-mtg-toast pointer-events-auto flex items-center gap-3 px-3 py-2 text-[12px] ${
          notice?.kind === "error" ? "professor-mtg-toast--error" : ""
        }`}
      >
        <span className={notice?.kind === "error" ? "text-[#f0a8a0]" : "professor-mtg-body"}>
          {notice?.message ?? "Saving…"}
        </span>
        {notice?.undo?.length ? (
          <button
            type="button"
            className="professor-mtg-link text-[11px]"
            onClick={() => {
              const ops = notice.undo!;
              dismissNotice();
              applyOps(ops);
            }}
          >
            Undo
          </button>
        ) : null}
        {notice ? (
          <button
            type="button"
            className="professor-mtg-icon-btn"
            aria-label="Dismiss"
            onClick={dismissNotice}
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
