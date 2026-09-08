"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SOL_DIRECTED_DECK_DISPLAY_ORDER_V1,
  SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS,
} from "@/lib/deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import { tcgPriceForCardName } from "@/lib/deck-synthesis/professor-brew-scryfall-prices-v1";
import { COMMANDER_LIBRARY_SIZE_V1 } from "@/lib/professor-deck-editor/legality-v1";
import type { DeckBoardV1, DeckMarkerScopeV1 } from "@/lib/professor-deck-editor/types-v1";
import { CardNameHoverPreview } from "../CardNameHoverPreview";
import { DeckEditorCardRow } from "./DeckEditorCardRow";
import { DeckEditorCardSearch } from "./DeckEditorCardSearch";
import { DeckEditorStatus } from "./DeckEditorStatus";
import {
  CardCondensedView,
  CardGridView,
  CardSpoilerView,
  CardStackView,
} from "./DeckEditorCardViews";
import { DeckDistributionStrip } from "./DeckDistributionStrip";
import { buildDeckDistributionV1, deckDistributionChartableV1 } from "./distribution-v1";
import {
  DECK_EDITOR_GROUP_LABELS_V1,
  DECK_EDITOR_SORT_LABELS_V1,
  DECK_EDITOR_VIEW_LABELS_V1,
  groupKeysForV1,
  sortCardsV1,
  sortGroupsV1,
} from "./grouping-v1";
import type {
  DeckEditorGroupModeV1,
  DeckEditorSortModeV1,
  DeckEditorViewModeV1,
  GroupingContextV1,
} from "./grouping-v1";
import type { DeckEditorCard, DeckEditorSearchHit } from "./types";
import { DeckSynergyBar } from "./DeckSynergyBar";
import { CardGrabProviderV1 } from "./card-grab-v1";
import { planMarkerCreateV1 } from "./marker-create-v1";
import { CardRevealOverlay } from "./CardRevealOverlay";
import { DeckInsightDrawer } from "./DeckInsightDrawer";
import { DeckRegradePanelV1 } from "./DeckRegradePanelV1";
import type { DeckEditorKeyV1 } from "./deck-key-v1";
import { useCardEnrichment } from "./useCardEnrichment";
import { useCart } from "@/hooks/useCart";
import { useDeckEditor } from "./useDeckEditor";
import { useDeckSynergy } from "./useDeckSynergy";

/** Physical cards, not rows: basic lands collapse into one row carrying a count. */
function copiesOfV1(cards: readonly DeckEditorCard[]): number {
  return cards.reduce((sum, card) => sum + card.copies, 0);
}

/**
 * The whole deck in one view.
 *
 * Boards used to be tabs, which meant the bench was a place you had to
 * remember to go and look at and a cut was indistinguishable from a deletion.
 * They are now presentation: the mainboard is the grouped list, the bench is
 * one section above it, and a cut card leaves the view entirely. The boards
 * themselves are untouched, so the 100-count and legality still read only the
 * mainboard and a cut card is still sitting there to be brought back.
 */
export function ProfessorDeckEditorPanel({
  slug,
  buildId,
  deckId,
}: DeckEditorKeyV1 & {
  slug: string;
}) {
  const editor = useDeckEditor({ slug, buildId, deckId });
  const { payload, applyOps } = editor;

  const [viewMode, setViewMode] = useState<DeckEditorViewModeV1>("text");
  const [groupMode, setGroupMode] = useState<DeckEditorGroupModeV1>("type");
  const [sortMode, setSortMode] = useState<DeckEditorSortModeV1>("name");
  const [activeFacets, setActiveFacets] = useState<string[]>([]);
  const [synergyKey, setSynergyKey] = useState<string | null>(null);
  /** The group a distribution bar has been clicked to focus, if any. */
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  /** The card being held up for a proper look, if any. */
  const [revealKey, setRevealKey] = useState<string | null>(null);
  /** Last card dropped into the cart, shown briefly so the drop is confirmed. */
  const [cartFlash, setCartFlash] = useState<string | null>(null);
  /** Whether the cut cards are on show. See the disclosure at the foot of the list. */
  const [showCut, setShowCut] = useState(false);
  /** Whether the measured bracket-and-score drawer is open. */
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const deck = payload?.deck ?? null;
  const cardNames = useMemo(
    () => (deck ? [deck.commander.name, ...deck.cards.map((card) => card.name)] : []),
    [deck],
  );
  const enrichment = useCardEnrichment(slug, cardNames);
  const synergy = useDeckSynergy({ slug, buildId, deckId, revision: deck?.revision ?? null });
  // The same cart the shop's inventory page uses — it is keyed by store slug in
  // localStorage, so a card dropped in here is waiting on the inventory page.
  const cart = useCart(slug);

  /**
   * Whether a card can go in the cart.
   *
   * It needs a shelf item to buy and a price to charge for it. A priced,
   * in-stock card is exactly what the green outline already promises, so the
   * Cart bucket appears on the cards a player has been told are buyable and
   * nowhere else — a bucket that rejects the card you dropped in it is worse
   * than no bucket.
   */
  const cartEligible = (card: DeckEditorCard): boolean => {
    const entry = enrichment.inventoryByName[card.name];
    return Boolean(
      entry?.inventoryItemId && entry.quantity > 0 && entry.listPrice != null && entry.listPrice > 0,
    );
  };

  const addToCart = (card: DeckEditorCard) => {
    const entry = enrichment.inventoryByName[card.name];
    if (!entry?.inventoryItemId) return;
    cart.add({
      inventoryItemId: entry.inventoryItemId,
      name: card.name,
      setName: entry.setName,
      imageUrl: enrichment.imageUrls[card.name],
      unitPrice: entry.listPrice ?? 0,
      // Never offer more copies than are on the shelf.
      maxQuantity: Math.max(1, entry.quantity),
    });
    setCartFlash(card.name);
  };

  useEffect(() => {
    if (!cartFlash) return;
    const timer = setTimeout(() => setCartFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [cartFlash]);

  // Selecting a card is what triggers the synergy fetch, so a player who never
  // uses the feature never pays for it.
  const selectForSynergy = (cardKey: string) => {
    synergy.enable();
    setSynergyKey((current) => (current === cardKey ? null : cardKey));
  };

  const synergyLinks = synergyKey ? (synergy.synergy?.linksByCardKey[synergyKey] ?? null) : null;

  /**
   * Cards to fade while a synergy selection is active: everything that is
   * neither the selected card nor one of its partners. Left empty until the
   * links have actually arrived, so the deck does not flash grey on click.
   */
  const dimmedKeys = useMemo(() => {
    if (!synergyKey || !synergy.synergy) return undefined;
    const keep = new Set<string>([synergyKey, ...(synergyLinks ?? []).map((link) => link.cardKey)]);
    const dimmed = new Set<string>();
    for (const card of deck?.cards ?? []) {
      if (!keep.has(card.cardKey)) dimmed.add(card.cardKey);
    }
    return dimmed;
  }, [deck?.cards, synergy.synergy, synergyKey, synergyLinks]);

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

  /** A deck nobody built for them, so this panel is the whole workspace. */
  const handBuilt = deck !== null && !deck.buildId;
  const libraryCount = payload?.legality.mainboardLibraryCount ?? 0;
  const readyToGrade = libraryCount >= COMMANDER_LIBRARY_SIZE_V1;

  /** The mainboard, which is the only board the bracket and the score read. */
  const mainboardCards = useMemo(
    () => (deck?.cards ?? []).filter((card) => card.board === "mainboard"),
    [deck?.cards],
  );

  const illegalByCardKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const violation of payload?.legality.violations ?? []) {
      if (violation.severity !== "illegal" || !violation.cardKey) continue;
      if (!map.has(violation.cardKey)) map.set(violation.cardKey, violation.message);
    }
    return map;
  }, [payload?.legality.violations]);

  /** Whether the search box or a facet chip is narrowing what is on screen. */
  const filtering = filter.trim().length > 0 || activeFacets.length > 0;

  /**
   * The three lists the one view draws from.
   *
   * Split here rather than by a tab: the deck's groups come from the mainboard,
   * the Bench section from `considering`, and cut cards are held back for the
   * disclosure at the foot instead of being drawn with the deck. One predicate
   * for all three, so a filter cannot mean different things in each section.
   */
  const partition = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = (card: DeckEditorCard) => {
      if (needle && !card.name.toLowerCase().includes(needle)) return false;
      if (activeFacets.length === 0) return true;
      const ids = new Set([
        ...(card.derivedMarkers ?? []).map((marker) => marker.id),
        ...card.markerIds,
      ]);
      return activeFacets.some((facet) => ids.has(facet));
    };

    const deckCards: DeckEditorCard[] = [];
    const benchCards: DeckEditorCard[] = [];
    const cutCards: DeckEditorCard[] = [];
    for (const card of deck?.cards ?? []) {
      if (!matches(card)) continue;
      if (card.board === "mainboard") deckCards.push(card);
      else if (card.board === "considering") benchCards.push(card);
      else cutCards.push(card);
    }
    return { deckCards, benchCards, cutCards };
  }, [activeFacets, deck?.cards, filter]);

  // Prices come from the enrichment pass, so grouping and sorting by price only
  // becomes available as those responses land. Cards without a price sort last
  // rather than sorting as free.
  const groupingContext = useMemo<GroupingContextV1>(() => {
    const priceByName = new Map<string, number>();
    for (const [name, price] of Object.entries(enrichment.tcgPricesByName ?? {})) {
      if (price > 0) priceByName.set(name.toLowerCase(), price);
    }
    return { markerLabels, priceByName };
  }, [enrichment.tcgPricesByName, markerLabels]);

  const groups = useMemo(() => {
    const buckets = new Map<string, DeckEditorCard[]>();
    for (const card of partition.deckCards) {
      // A card can land in several sections at once — two tags means two
      // columns — so this pushes into every key it belongs to.
      for (const key of groupKeysForV1(card, groupMode, groupingContext)) {
        const bucket = buckets.get(key);
        if (bucket) bucket.push(card);
        else buckets.set(key, [card]);
      }
    }
    const sorted = sortGroupsV1(groupMode, [...buckets.entries()]);
    return sorted.map(
      ([label, cards]) => [label, sortCardsV1(cards, sortMode, groupingContext)] as const,
    );
  }, [groupMode, groupingContext, partition.deckCards, sortMode]);

  /**
   * The same grouping over the unfiltered mainboard.
   *
   * The distribution is measured here rather than over the filtered view: if it
   * followed the filter, clicking a bar would narrow the deck and the chart
   * would collapse to the single bar you just clicked — the control would
   * destroy its own context. Measuring the whole board keeps the shape stable
   * while you drill into it, and the focused bar stays lit to show where you
   * are. It is also what tells a stale focus from a filtered-out one, below.
   *
   * Only the mainboard: bench and cut cards are not in the deck, so putting
   * them in its curve would misreport the shape you are cutting against.
   */
  const boardGroups = useMemo(() => {
    if (!deckDistributionChartableV1(groupMode)) return [];
    const buckets = new Map<string, DeckEditorCard[]>();
    for (const card of deck?.cards ?? []) {
      if (card.board !== "mainboard") continue;
      for (const key of groupKeysForV1(card, groupMode, groupingContext)) {
        const bucket = buckets.get(key);
        if (bucket) bucket.push(card);
        else buckets.set(key, [card]);
      }
    }
    return sortGroupsV1(groupMode, [...buckets.entries()]);
  }, [deck?.cards, groupMode, groupingContext]);

  const distribution = useMemo(
    () => buildDeckDistributionV1(groupMode, boardGroups),
    [boardGroups, groupMode],
  );

  /**
   * The focus, if it still names a group.
   *
   * A focus can outlive the group it points at, and cutting is how that
   * happens: cut the last card in the focused group and a lit bar would be left
   * sitting over an empty list with no card in it to explain itself. Resolved
   * here rather than corrected in an effect, so the empty list is never painted
   * at all. Checked against the unfiltered board, so typing in the filter box
   * narrows the focused group instead of throwing the focus away.
   */
  const activeFocus =
    focusGroup && boardGroups.some(([label]) => label === focusGroup) ? focusGroup : null;

  const visibleGroups = useMemo(
    () => (activeFocus ? groups.filter(([label]) => label === activeFocus) : groups),
    [activeFocus, groups],
  );

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
      // A cut is the one move whose card leaves the view, so it is the one that
      // has to say where the card went. "Saved." next to an Undo button would
      // read like the card had been deleted and the undo was a long shot.
      message:
        destination === "cut" ? `${card.name} cut — off the list, not gone.` : undefined,
    });
  };

  // Shared by the Mark menu on a row and by dropping a card on a tag bucket, so
  // the two routes cannot drift into applying a marker differently.
  const toggleMarker = (card: DeckEditorCard, markerId: string, assign: boolean) => {
    applyOps([
      assign
        ? { op: "assignMarker", cardKey: card.cardKey, markerId }
        : { op: "unassignMarker", cardKey: card.cardKey, markerId },
    ]);
  };

  /**
   * Naming a tag: the Mark menu's Add box and the tray's New tag bucket both
   * land here, so a tag made either way is the same tag.
   *
   * The plan may come back empty — a name that slugs to nothing, or one that
   * names a tag the card already carries. Both are states the deck is already
   * in, so nothing is sent and nothing is said about it.
   */
  const createAndAssignMarker = (
    card: DeckEditorCard,
    label: string,
    scope: DeckMarkerScopeV1,
    /** See `planMarkerCreateV1`: true where the caller offered no scope choice. */
    matchAcrossScopes = false,
  ) => {
    const plan = planMarkerCreateV1({
      label,
      scope,
      cardKey: card.cardKey,
      cardMarkerIds: card.markerIds,
      markers: deck?.markers ?? [],
      matchAcrossScopes,
    });
    if (plan.ops.length === 0) return;
    applyOps(plan.ops, {
      undo: plan.undo,
      // Named in the toast because the tray's version happens away from the
      // row: the card is back in the list by then, and this is what confirms
      // the tag landed on the right one.
      message: `${card.name} tagged “${plan.label}”.`,
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

  /** One full-detail row: costs, markers, prices and the edit actions. */
  const renderTextRow = (card: DeckEditorCard) => (
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
        onToggleMarker={(markerId, assign) => toggleMarker(card, markerId, assign)}
        onCreateAndAssignMarker={(markerLabel, scope) =>
          createAndAssignMarker(card, markerLabel, scope)
        }
        onDeleteMarker={(markerId) => applyOps([{ op: "deleteMarker", markerId }])}
        onSynergy={() => selectForSynergy(card.cardKey)}
        synergySelected={synergyKey === card.cardKey}
        synergyDimmed={dimmedKeys?.has(card.cardKey)}
      />
  );

  /**
   * How one section draws. Only the presentation changes here — every view is
   * handed the same grouped, sorted cards, so switching view can never alter
   * which cards a player is looking at.
   */
  const sectionBody = (cards: DeckEditorCard[]) => {
    if (viewMode === "text") return cards.map(renderTextRow);
    const shared = {
      cards,
      imageUrls: enrichment.imageUrls,
      dimmed: dimmedKeys,
      selectedKey: synergyKey,
      onSelect: (card: DeckEditorCard) => selectForSynergy(card.cardKey),
      onReveal: (card: DeckEditorCard) => setRevealKey(card.cardKey),
      slug,
      inventoryByName: enrichment.inventoryByName,
      cartEligible,
      onCart: addToCart,
      onMove: move,
      onRemove: (card: DeckEditorCard) =>
        applyOps([{ op: "removeCard", cardKey: card.cardKey }]),
    };
    if (viewMode === "condensed") return <CardCondensedView {...shared} />;
    if (viewMode === "grid") return <CardGridView {...shared} />;
    if (viewMode === "stacks") return <CardStackView {...shared} />;
    return <CardSpoilerView {...shared} />;
  };

  /**
   * The header every section wears.
   *
   * Bench and Cut are peers of the generated groups rather than a different
   * kind of thing, so they wear the group's own header instead of a design of
   * their own — the `note` is the only concession, and it is there to say that
   * those cards are outside the deck.
   */
  const sectionHeader = (label: string, count: string, note?: string) => (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-[var(--mtg-stone-border)] pb-1.5">
      <h3 className="professor-mtg-label text-[12px]">{label}</h3>
      {note ? <span className="professor-mtg-muted text-[10px] italic">{note}</span> : null}
      <span className="professor-mtg-muted ml-auto text-xs tabular-nums">{count}</span>
    </div>
  );

  // Resolved from the key rather than held as an object, so the overlay keeps
  // showing live data as edits land instead of a snapshot from when it opened.
  const revealCard = revealKey
    ? (deck.cards.find((card) => card.cardKey === revealKey) ?? null)
    : null;

  const benchCards = sortCardsV1(partition.benchCards, sortMode, groupingContext);
  const cutCards = sortCardsV1(partition.cutCards, sortMode, groupingContext);

  // The commander is not a card you can filter for, so it steps out of the way
  // while a filter is on rather than sitting above a list it is not part of.
  const showCommander = !filtering;

  /** A count that admits it is a subset, so a filtered section never overstates itself. */
  const sectionCount = (shown: readonly DeckEditorCard[], total: number) =>
    filtering ? `${copiesOfV1(shown)} of ${total}` : String(total);

  return (
    <CardGrabProviderV1
      imageUrls={enrichment.imageUrls}
      markers={deck.markers}
      cartEligible={cartEligible}
      onCart={addToCart}
      onMove={move}
      onToggleMarker={toggleMarker}
      // The tray has no room to ask which scope, so a name that already belongs
      // to a tag of either scope reuses that one rather than making a twin.
      onCreateTag={(card, label) => createAndAssignMarker(card, label, "deck", true)}
    >
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
              deckId={deckId}
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

        {synergyKey ? (
          <DeckSynergyBar
            cardName={
              deck.cards.find((card) => card.cardKey === synergyKey)?.name ?? "This card"
            }
            links={synergyLinks}
            loading={synergy.loading}
            error={synergy.error}
            semanticUnavailable={Boolean(synergy.synergy?.semanticUnavailable)}
            imageUrls={enrichment.imageUrls}
            onClear={() => setSynergyKey(null)}
            onSelectCard={selectForSynergy}
          />
        ) : (
          <div className="professor-mtg-panel-status px-4 py-2 sm:px-5">
            <p className="professor-mtg-muted text-[10px]">
              Click a card to look at it · press and hold to pick it up, then drop it on Cart,
              Bench or Cut · cut cards leave the list but are kept at the foot of it · green =
              shop stock · press / to add a card
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--mtg-stone-border)] px-4 py-3 sm:px-5">
          <label className="professor-mtg-label text-[10px]" htmlFor="deck-editor-view">
            View
          </label>
          <select
            id="deck-editor-view"
            className="professor-mtg-input px-2 py-1 text-xs"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as DeckEditorViewModeV1)}
          >
            {(Object.keys(DECK_EDITOR_VIEW_LABELS_V1) as DeckEditorViewModeV1[]).map((mode) => (
              <option key={mode} value={mode}>
                {DECK_EDITOR_VIEW_LABELS_V1[mode]}
              </option>
            ))}
          </select>

          <label className="professor-mtg-label text-[10px]" htmlFor="deck-editor-group">
            Group by
          </label>
          <select
            id="deck-editor-group"
            className="professor-mtg-input px-2 py-1 text-xs"
            value={groupMode}
            onChange={(event) => {
              setGroupMode(event.target.value as DeckEditorGroupModeV1);
              setFocusGroup(null);
            }}
          >
            {(Object.keys(DECK_EDITOR_GROUP_LABELS_V1) as DeckEditorGroupModeV1[]).map((mode) => (
              <option key={mode} value={mode}>
                {DECK_EDITOR_GROUP_LABELS_V1[mode]}
              </option>
            ))}
          </select>

          {/* Sort is deliberately separate from grouping: sorting by colour while
              grouped by type is the combination Moxfield users ask for and cannot
              get, because there the two controls are the same control. */}
          <label className="professor-mtg-label text-[10px]" htmlFor="deck-editor-sort">
            Sort by
          </label>
          <select
            id="deck-editor-sort"
            className="professor-mtg-input px-2 py-1 text-xs"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as DeckEditorSortModeV1)}
          >
            {(Object.keys(DECK_EDITOR_SORT_LABELS_V1) as DeckEditorSortModeV1[]).map((mode) => (
              <option key={mode} value={mode}>
                {DECK_EDITOR_SORT_LABELS_V1[mode]}
              </option>
            ))}
          </select>

          <input
            type="search"
            className="professor-mtg-input w-40 px-2 py-1 text-xs"
            placeholder="Filter these cards…"
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

          {/* Dropping a card on Cart is only useful if the cart is somewhere a
              player can see. It is the shop's own cart, so this points at the
              inventory page that owns the checkout. */}
          {cart.count > 0 ? (
            <a
              href={`/s/${encodeURIComponent(slug)}/inventory`}
              className="professor-mtg-btn ml-auto px-2.5 py-1 text-[11px] text-[var(--ok)]"
            >
              Cart {cart.count} · ${cart.subtotal.toFixed(2)}
            </a>
          ) : null}
        </div>

        {/* Sticky, because a curve's whole job is to inform the cut you are about
            to make — and at the foot of a 99-card board it would sit permanently
            below the fold. It only appears on axes whose distribution means
            something; see distribution-v1. */}
        {distribution ? (
          <div className="sticky top-0 z-20">
            <DeckDistributionStrip
              distribution={distribution}
              axisLabel={DECK_EDITOR_GROUP_LABELS_V1[groupMode]}
              focused={activeFocus}
              onFocus={setFocusGroup}
            />
          </div>
        ) : null}

        {/* Only for decks built by hand. A deck the Professor built already has
            a bracket read-out in the panel around this one, and two buttons
            called the same thing on one screen is worse than none. */}
        {handBuilt ? (
          <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-5">
            <button
              type="button"
              className="professor-mtg-btn px-3 py-1.5 text-[11px]"
              disabled={!readyToGrade}
              onClick={() => setRegradeOpen(true)}
            >
              Check bracket
            </button>
            <p className="professor-mtg-muted text-[11px]">
              {readyToGrade
                ? "Measures this list against the Commander bracket rubric."
                : `${COMMANDER_LIBRARY_SIZE_V1 - libraryCount} more card${
                    COMMANDER_LIBRARY_SIZE_V1 - libraryCount === 1 ? "" : "s"
                  } before the bracket means anything.`}
            </p>
          </div>
        ) : null}

        <div className="px-4 py-4 sm:px-5">
          <DeckEditorStatus
            legality={payload.legality}
            editedByUser={deck.editedByUser}
            hasBaseline={deck.baselineCards.length > 0}
            stale={editor.saving}
            onRevert={() => applyOps([{ op: "revertToBaseline" }])}
            onRegrade={readyToGrade ? () => setRegradeOpen(true) : undefined}
          />
        </div>

        {/* The bench, above the deck's groups rather than among them.
            It sits outside the column container on purpose: a section flowing
            into the same CSS columns would land beside a group and read as one
            of them, and these cards are not in the 100.

            Above rather than below, because a benched card is a decision still
            waiting to be made and at the foot of ninety-nine rows it was a
            decision nobody could see. The list is capped and scrolls instead of
            growing: it is borrowing the space directly above the deck, and a
            bench of thirty would otherwise push the deck itself off screen.

            Nothing at all is drawn when nothing is benched — an empty Bench row
            would cost a line on every deck that never uses the feature. Once
            something is benched the header stays even if the filter excludes all
            of it, so a search can never make the bench look empty. */}
        {boardCounts.considering > 0 ? (
          <section className="professor-mtg-offdeck border-b border-[var(--mtg-stone-border)] px-4 py-3 sm:px-5">
            {sectionHeader(
              "Bench",
              sectionCount(benchCards, boardCounts.considering),
              "not in the 100",
            )}
            {benchCards.length > 0 ? (
              <div className="professor-mtg-offdeck-cards max-h-[11rem] overflow-y-auto pr-1">
                {sectionBody(benchCards)}
              </div>
            ) : (
              <p className="professor-mtg-muted text-xs italic">
                No benched card matches that filter.
              </p>
            )}
          </section>
        ) : null}

        {showCommander || visibleGroups.length > 0 ? (
          // CSS columns rather than a grid: sections vary in height, and a grid
          // would leave a tall Creatures section sitting next to a wall of space.
          //
          // The column width is per view because the right answer differs. The
          // tiling views pack their own cards and want the full width to do it
          // in. Stacks are single-file by nature, so they want many narrow
          // columns side by side. The text views sit in between.
          <div
            className={`gap-6 px-4 pb-6 sm:px-5 ${
              viewMode === "grid" || viewMode === "spoiler"
                ? "columns-1"
                : viewMode === "stacks"
                  ? "columns-[9rem] gap-4"
                  : "columns-1 md:columns-2 xl:columns-3"
            }`}
          >
            {/* The commander is stored outside the card list, because it is the one
                card in the deck that cannot be swapped here — changing it would
                invalidate the whole build. It is still shown, since a deck editor
                that omits the commander looks like it has lost it. */}
            {showCommander ? (
              <section className="mb-5 break-inside-avoid">
                {sectionHeader("Commander", "1")}
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
            {visibleGroups.map(([label, cards]) => (
              <section key={label} className="mb-5 break-inside-avoid">
                {sectionHeader(label, String(copiesOfV1(cards)))}
                {sectionBody(cards)}
              </section>
            ))}
          </div>
        ) : null}

        {/* Owed whenever none of the deck is on screen, which a focused group
            narrowed to nothing by the filter can cause as easily as an empty
            deck can. Without it the list is blank under a lit distribution bar
            and nothing says why. */}
        {visibleGroups.length === 0 ? (
          <p className="professor-mtg-muted px-5 pb-6 text-center text-sm italic">
            {activeFocus && partition.deckCards.length > 0
              ? `No card in ${activeFocus} matches that filter.`
              : boardCounts.mainboard > 0
                ? "No cards in the deck match that filter."
                : boardCounts.considering > 0
                  ? "Every card is on the bench. Hold one and drop it on Deck to play it."
                  : "There are no cards in this deck yet — add one with the search box."}
          </p>
        ) : null}

        {/* The way back for a cut card.
            Cutting takes a card out of the view but leaves it on the `cut`
            board, so a mis-drop mid-drag is recoverable. The toast's Undo covers
            the moment after the drop; this covers the rest of the session, and
            without it a cut would be indistinguishable from a deletion. The
            count is of every cut card, never a filtered subset, because a
            recovery route a filter can hide is not a recovery route. */}
        {boardCounts.cut > 0 ? (
          <div className="px-4 pb-6 sm:px-5">
            <button
              type="button"
              className="professor-mtg-link text-[11px]"
              aria-expanded={showCut}
              onClick={() => setShowCut((open) => !open)}
            >
              {boardCounts.cut} cut card{boardCounts.cut === 1 ? "" : "s"} ·{" "}
              {showCut ? "hide" : "show"}
            </button>
            {showCut ? (
              <section className="professor-mtg-offdeck mt-3 pt-4">
                {sectionHeader(
                  "Cut",
                  sectionCount(cutCards, boardCounts.cut),
                  "move one to Deck to put it back",
                )}
                {cutCards.length > 0 ? (
                  <div className="professor-mtg-offdeck-cards">{sectionBody(cutCards)}</div>
                ) : (
                  <p className="professor-mtg-muted text-xs italic">
                    No cut card matches that filter.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        ) : null}

        <DeckInsightDrawer
          open={regradeOpen}
          title="This deck, measured"
          subtitle={`Bracket and score for ${deck.commander.name} and the ${libraryCount} cards in the deck right now — not for the list as it was built.`}
          onClose={() => setRegradeOpen(false)}
        >
          <DeckRegradePanelV1
            slug={slug}
            commanderName={deck.commander.name}
            commanderOracleId={deck.commander.oracleId}
            cards={mainboardCards}
            requestedBracket={deck.bracket}
            deckKey={{ buildId, deckId }}
            revision={deck.revision}
          />
        </DeckInsightDrawer>

        {revealCard ? (
          <CardRevealOverlay
            card={revealCard}
            markers={deck.markers}
            imageUrl={enrichment.imageUrls[revealCard.name]}
            inventory={enrichment.inventoryByName[revealCard.name]}
            tcgPrice={tcgPriceForCardName(enrichment.tcgPricesByName, revealCard.name)}
            cartEligible={cartEligible(revealCard)}
            synergySelected={synergyKey === revealCard.cardKey}
            onCart={() => addToCart(revealCard)}
            onSynergy={() => selectForSynergy(revealCard.cardKey)}
            onMove={(destination) => move(revealCard, destination)}
            onRemove={
              revealCard.origin === "user"
                ? () => applyOps([{ op: "removeCard", cardKey: revealCard.cardKey }])
                : undefined
            }
            onClose={() => setRevealKey(null)}
          />
        ) : null}

        {cartFlash ? (
          <div className="pointer-events-none sticky bottom-3 z-30 flex justify-start px-4 sm:px-5">
            <p
              role="status"
              aria-live="polite"
              className="professor-mtg-toast px-3 py-2 text-[12px] text-[var(--ok)]"
            >
              {cartFlash} added to your cart
            </p>
          </div>
        ) : null}

        <DeckEditorToast editor={editor} />
      </div>
    </CardGrabProviderV1>
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
