"use client";

import { CardNameHoverPreview } from "../CardNameHoverPreview";
import { CardTileMenu } from "./CardTileMenu";
import { ManaCost } from "./ManaCost";
import type { DeckBoardV1 } from "@/lib/professor-deck-editor/types-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import type { DeckEditorCard } from "./types";

/**
 * The image-led ways of looking at a deck.
 *
 * The text views answer "what is in here"; these answer "what does this deck
 * look like", which is the question you are actually asking when you are
 * cutting cards. Each takes the same card array so the view control never
 * changes what is on screen, only how it is drawn.
 */

export type CardViewProps = {
  cards: DeckEditorCard[];
  imageUrls: Record<string, string>;
  /** Cards to dim, when a synergy or filter selection is narrowing the deck. */
  dimmed?: Set<string>;
  /** The card the player has selected, if any. */
  selectedKey?: string | null;
  onSelect?: (card: DeckEditorCard) => void;
  /** Everything the hover menu needs. Omitted in read-only contexts. */
  slug?: string;
  inventoryByName?: Record<string, ProfessorDeckInventoryEntryV43>;
  onMove?: (card: DeckEditorCard, board: DeckBoardV1) => void;
  onRemove?: (card: DeckEditorCard) => void;
};

/**
 * Tile widths, and why they are small.
 *
 * The synergy highlight is only worth anything if you can see the whole deck
 * while it is on — dimming forty cards you have to scroll past tells you
 * nothing. A ninety-nine card deck at these widths is a handful of rows per
 * section, which is the density Moxfield and Archidekt settle on too. Set as
 * auto-fill minimums rather than fixed column counts so the same section fills
 * a phone and an ultrawide without a pile of breakpoints.
 */
const GRID_TILE_MIN = "5.5rem";
const SPOILER_TILE_MIN = "9.5rem";
const STACK_COLUMN_MIN = "8.5rem";

/** Shared hover chrome: a ring on hover so a tile reads as clickable. */
const TILE_BUTTON_CLASS =
  "group relative block w-full overflow-hidden rounded-[4.5%] transition hover:ring-2 hover:ring-[var(--accent-lo)]";

/**
 * Only the player's own additions can be deleted outright.
 *
 * A card the Professor chose is cut rather than removed, so its rationale
 * survives and the build can be restored. Offering Remove on one would be an
 * action the server is right to reject.
 */
function removable(
  card: DeckEditorCard,
  onRemove: CardViewProps["onRemove"],
): (() => void) | undefined {
  if (!onRemove || card.origin !== "user") return undefined;
  return () => onRemove(card);
}

function imageFor(card: DeckEditorCard, imageUrls: Record<string, string>): string | null {
  return imageUrls[card.name] ?? imageUrls[card.name.toLowerCase()] ?? null;
}

function cardStateClass(
  card: DeckEditorCard,
  { dimmed, selectedKey }: Pick<CardViewProps, "dimmed" | "selectedKey">,
): string {
  if (selectedKey === card.cardKey) return "ring-2 ring-[var(--accent)] opacity-100";
  if (dimmed?.has(card.cardKey)) return "opacity-25 saturate-50";
  return "opacity-100";
}

/** A plain placeholder so a missing image never collapses the layout. */
function CardFallback({ name }: { name: string }) {
  return (
    <span className="flex h-full w-full items-center justify-center rounded-[4.5%] border border-[var(--line-subtle)] bg-[var(--ink-800)] p-2 text-center text-[10px] leading-tight text-[var(--text-lo)]">
      {name}
    </span>
  );
}

/**
 * A single image tile: the card, a copies badge, and the hover menu.
 *
 * The tile is a div rather than a button so the menu can live inside it
 * without nesting interactive elements; the card image carries its own button
 * for the synergy toggle.
 */
function CardTile({
  card,
  imageUrls,
  dimmed,
  selectedKey,
  onSelect,
  slug,
  inventoryByName,
  onMove,
  onRemove,
}: CardViewProps & { card: DeckEditorCard }) {
  const url = imageFor(card, imageUrls);
  const showMenu = Boolean(slug && onMove);

  return (
    <div className={`group relative transition ${cardStateClass(card, { dimmed, selectedKey })}`}>
      <button
        type="button"
        onClick={() => onSelect?.(card)}
        title={`${card.name} — click to show what it works with`}
        className={`${TILE_BUTTON_CLASS} aspect-[5/7]`}
      >
        {url ? (
          <img
            src={url}
            alt={card.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <CardFallback name={card.name} />
        )}
        {card.copies > 1 ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-hi)]">
            ×{card.copies}
          </span>
        ) : null}
      </button>
      {showMenu ? (
        <CardTileMenu
          card={card}
          slug={slug!}
          inventory={inventoryByName?.[card.name]}
          synergySelected={selectedKey === card.cardKey}
          onSynergy={() => onSelect?.(card)}
          onMove={(board) => onMove!(card, board)}
          onRemove={removable(card, onRemove)}
        />
      ) : null}
    </div>
  );
}

/** Small card images, packed tight enough to take in a whole section at once. */
export function CardGridView(props: CardViewProps) {
  return (
    <ul
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_TILE_MIN}, 1fr))` }}
    >
      {props.cards.map((card) => (
        <li key={card.cardKey}>
          <CardTile {...props} card={card} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Overlapping cards, clipped to their title bars, with the last of a run shown
 * whole — the way a pile of cards looks fanned out on a table. This is the
 * densest of the visual views: it fits a section in roughly the height of one
 * card plus a name plate each.
 */
export function CardStackView(props: CardViewProps) {
  const { cards, imageUrls, dimmed, selectedKey, onSelect, slug, inventoryByName, onMove, onRemove } =
    props;
  const showMenu = Boolean(slug && onMove);
  return (
    <ol className="relative">
      {cards.map((card, index) => {
        const url = imageFor(card, imageUrls);
        const last = index === cards.length - 1;
        const menu = showMenu ? (
          <CardTileMenu
            card={card}
            slug={slug!}
            inventory={inventoryByName?.[card.name]}
            synergySelected={selectedKey === card.cardKey}
            onSynergy={() => onSelect?.(card)}
            onMove={(board) => onMove!(card, board)}
            onRemove={removable(card, onRemove)}
          />
        ) : null;

        // The bottom card of a run is shown whole; the rest are clipped to a
        // name plate. The plate carries the name as real text rather than
        // relying on the sliver of card art that happens to fall inside it —
        // at column widths the printed title is only a few pixels tall and
        // scaling makes it illegible, which turns the whole stack into a row
        // of coloured bars.
        if (last) {
          return (
            <li
              key={card.cardKey}
              className={`group relative transition ${cardStateClass(card, { dimmed, selectedKey })}`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(card)}
                title={`${card.name} — click to show what it works with`}
                className={`${TILE_BUTTON_CLASS} rounded-b-[3.5%] rounded-t-none`}
              >
                {url ? (
                  <img src={url} alt={card.name} loading="lazy" decoding="async" className="block w-full" />
                ) : (
                  <span className="block aspect-[5/7] w-full">
                    <CardFallback name={card.name} />
                  </span>
                )}
                {card.copies > 1 ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-hi)]">
                    ×{card.copies}
                  </span>
                ) : null}
              </button>
              {menu}
            </li>
          );
        }

        return (
          <li
            key={card.cardKey}
            className={`group relative transition ${cardStateClass(card, { dimmed, selectedKey })}`}
          >
            <button
              type="button"
              onClick={() => onSelect?.(card)}
              title={`${card.name} — click to show what it works with`}
              className="relative block h-[1.75rem] w-full overflow-hidden border-b border-black/50 transition hover:ring-2 hover:ring-[var(--accent-lo)]"
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              ) : null}
              <span className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/40" />
              <span className="absolute inset-0 flex items-center gap-1.5 pl-2 pr-7">
                <span className="min-w-0 flex-1 truncate text-left text-[11px] text-[var(--text-hi)]">
                  {card.name}
                </span>
                {card.copies > 1 ? (
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--text-hi)]">
                    ×{card.copies}
                  </span>
                ) : null}
              </span>
            </button>
            {menu}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The same tiles at a size where the printed rules text is readable.
 *
 * Bigger than the grid but still several to a row: the point of spoiler is to
 * read cards without hovering, not to fill the screen with two of them.
 */
export function CardSpoilerView(props: CardViewProps) {
  return (
    <ul
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${SPOILER_TILE_MIN}, 1fr))` }}
    >
      {props.cards.map((card) => (
        <li key={card.cardKey}>
          <CardTile {...props} card={card} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One line per card: count, name, cost. No actions and no markers, for when the
 * question is the shape of the list rather than any individual card.
 */
export function CardCondensedView({ cards, dimmed, selectedKey, onSelect }: CardViewProps) {
  return (
    <ul className="text-sm">
      {cards.map((card) => (
        <li
          key={card.cardKey}
          className={`flex items-center gap-2 py-0.5 transition ${
            selectedKey === card.cardKey
              ? "text-[var(--accent-hi)]"
              : dimmed?.has(card.cardKey)
                ? "opacity-30"
                : ""
          }`}
        >
          <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-lo)]">
            {card.copies}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <CardNameHoverPreview name={card.name} onClick={() => onSelect?.(card)} />
          </span>
          {card.display?.manaCost ? <ManaCost cost={card.display.manaCost} /> : null}
        </li>
      ))}
    </ul>
  );
}
