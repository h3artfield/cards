"use client";

import { useEffect, useRef, useState } from "react";
import { CardNameHoverPreview } from "../CardNameHoverPreview";
import { CardTileMenu } from "./CardTileMenu";
import { ManaCost } from "./ManaCost";
import { useCardGrabV1 } from "./card-grab-v1";
import type { DeckBoardV1 } from "@/lib/professor-deck-editor/types-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import { overlayTone, type OverlayTone } from "@/lib/collection/owned-index";
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
  /** Light up what a card works with. Reached from the tile's actions menu. */
  onSelect?: (card: DeckEditorCard) => void;
  /** Hold a card up: the printed card plus the Professor's reasoning. */
  onReveal?: (card: DeckEditorCard) => void;
  /** Everything the hover menu needs. Omitted in read-only contexts. */
  slug?: string;
  inventoryByName?: Record<string, ProfessorDeckInventoryEntryV43>;
  /** Whether a card can go in the shop cart — on our shelf, at a real price. */
  cartEligible?: (card: DeckEditorCard) => boolean;
  onCart?: (card: DeckEditorCard) => void;
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

/** Decode art only when the tile is near the viewport. */
function LazyCardImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || active) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  return (
    <img
      ref={ref}
      src={active ? src : undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="h-full w-full object-cover"
    />
  );
}

/** How many cards under the featured face still get a strip. The rest are a count. */
const STACK_PEEK_LIMIT = 8;

/** Whether a synergy or filter selection is pushing this card into the background. */
function dimClass(
  card: DeckEditorCard,
  { dimmed, selectedKey }: Pick<CardViewProps, "dimmed" | "selectedKey">,
): string {
  if (selectedKey === card.cardKey) return "opacity-100";
  if (dimmed?.has(card.cardKey)) return "opacity-25 saturate-50";
  return "opacity-100";
}

function overlayFor(
  card: DeckEditorCard,
  inventoryByName: CardViewProps["inventoryByName"],
): OverlayTone {
  if (card.copyOwnership) return overlayTone(card.copyOwnership);
  return (inventoryByName?.[card.name]?.quantity ?? 0) > 0 ? "buy_here" : "none";
}

/**
 * The outline on a card image.
 *
 * Blue is already in the binder, green is buy-here, and the warning ring is
 * need-elsewhere. A gold selection ring wins, since it is transient.
 */
function ringClass(selected: boolean, tone: OverlayTone): string {
  if (selected) return "ring-2 ring-[var(--accent)]";
  if (tone === "owned" || tone === "mixed") return "ring-1 ring-[var(--cool)]";
  if (tone === "buy_here") return "ring-1 ring-[var(--ok)]";
  if (tone === "need_elsewhere") return "ring-1 ring-[var(--warn)]";
  return "";
}

function stackToneClass(tone: OverlayTone): string {
  if (tone === "owned" || tone === "mixed") return " deck-card-stack__face--owned";
  if (tone === "buy_here") return " deck-card-stack__face--stock";
  if (tone === "need_elsewhere") return " deck-card-stack__face--need";
  return "";
}

function overlayTitle(tone: OverlayTone): string {
  if (tone === "owned") return " — in your binder";
  if (tone === "mixed") return " — some copies in your binder";
  if (tone === "buy_here") return " — buy here";
  if (tone === "need_elsewhere") return " — need elsewhere";
  return "";
}

/** Both things you can do to a card, in the order you discover them. */
function tileTitle(card: DeckEditorCard, tone: OverlayTone): string {
  return `${card.name}${overlayTitle(tone)} — click to look, hold to pick it up`;
}

/** A plain placeholder so a missing image never collapses the layout. */
function CardFallback({ name }: { name: string }) {
  return (
    <span className="flex h-full w-full items-center justify-center rounded-[4.5%] border border-[var(--line-subtle)] bg-[var(--ink-800)] p-2 text-center text-[10px] leading-tight text-[var(--text-lo)]">
      {name}
    </span>
  );
}

/** The actions menu for a tile, with the cart entry resolved. */
function tileMenu(props: CardViewProps, card: DeckEditorCard) {
  const { slug, inventoryByName, selectedKey, onSelect, onReveal, onCart, onMove, onRemove, cartEligible } =
    props;
  if (!slug || !onMove) return null;
  return (
    <CardTileMenu
      card={card}
      slug={slug}
      inventory={inventoryByName?.[card.name]}
      synergySelected={selectedKey === card.cardKey}
      onSynergy={() => onSelect?.(card)}
      onReveal={onReveal ? () => onReveal(card) : undefined}
      onCart={onCart && cartEligible?.(card) ? () => onCart(card) : undefined}
      onMove={(board) => onMove(card, board)}
      onRemove={removable(card, onRemove)}
    />
  );
}

/**
 * A single image tile: the card, a copies badge, and the hover menu.
 *
 * The tile is a div rather than a button so the menu can live inside it
 * without nesting interactive elements; the card image carries its own button
 * for the reveal.
 */
function CardTile(props: CardViewProps & { card: DeckEditorCard }) {
  const { card, imageUrls, dimmed, selectedKey, onReveal, inventoryByName } = props;
  const url = imageFor(card, imageUrls);
  const tone = overlayFor(card, inventoryByName);
  const selected = selectedKey === card.cardKey;
  const grab = useCardGrabV1();
  const held = grab?.heldKey === card.cardKey;

  return (
    <div
      onPointerDown={(event) => grab?.beginPress(card, event)}
      className={`group relative transition ${dimClass(card, { dimmed, selectedKey })} ${
        held ? "professor-mtg-grab-source" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onReveal?.(card)}
        title={tileTitle(card, tone)}
        // Named explicitly rather than relying on the image's alt text: the
        // images load lazily, so until one arrives the button would have no
        // accessible name at all.
        aria-label={card.name}
        className={`${TILE_BUTTON_CLASS} aspect-[5/7] ${ringClass(selected, tone)}`}
      >
        {url ? <LazyCardImage src={url} alt={card.name} /> : <CardFallback name={card.name} />}
        {card.copies > 1 ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-hi)]">
            ×{card.copies}
          </span>
        ) : null}
      </button>
      {tileMenu(props, card)}
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
 * Featured face on top, every other card peeking beneath it.
 *
 * In-stock copies get a green ring — the same shop language as the stock count
 * in the hero — so you can scan a column without opening each card.
 */
export function CardStackView(props: CardViewProps) {
  const { cards, imageUrls, dimmed, selectedKey, onReveal, inventoryByName } = props;
  const grab = useCardGrabV1();
  const featured = cards[0];
  if (!featured) return null;

  const peeks = cards.slice(1, STACK_PEEK_LIMIT + 1);
  const hidden = Math.max(0, cards.length - 1 - peeks.length);

  const renderLayer = (card: DeckEditorCard, featuredLayer: boolean, z: number) => {
    const url = featuredLayer ? imageFor(card, imageUrls) : null;
    const tone = overlayFor(card, inventoryByName);
    const selected = selectedKey === card.cardKey;
    const held = grab?.heldKey === card.cardKey;
    return (
      <li
        key={card.cardKey}
        onPointerDown={(event) => grab?.beginPress(card, event)}
        className={`deck-card-stack__layer ${featuredLayer ? "deck-card-stack__layer--featured" : "deck-card-stack__layer--peek"} ${dimClass(card, {
          dimmed,
          selectedKey,
        })} ${held ? "professor-mtg-grab-source" : ""}`}
        style={{ zIndex: z }}
      >
        <button
          type="button"
          onClick={() => onReveal?.(card)}
          title={tileTitle(card, tone)}
          aria-label={card.name}
          className={`deck-card-stack__face${selected ? " deck-card-stack__face--selected" : ""}${stackToneClass(tone)}`}
        >
          {featuredLayer ? (
            url ? (
              <img src={url} alt={card.name} loading="lazy" decoding="async" draggable={false} />
            ) : (
              <CardFallback name={card.name} />
            )
          ) : (
            <span className="deck-card-stack__peek-name">{card.name}</span>
          )}
          {card.copies > 1 ? (
            <span className="deck-card-stack__copies">×{card.copies}</span>
          ) : null}
        </button>
        {tileMenu(props, card)}
      </li>
    );
  };

  return (
    <ol className="deck-card-stack">
      {renderLayer(featured, true, peeks.length + 2)}
      {peeks.map((card, index) => renderLayer(card, false, peeks.length - index))}
      {hidden > 0 ? (
        <li className="deck-card-stack__more">
          +{hidden} more
        </li>
      ) : null}
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
export function CardCondensedView({
  cards,
  dimmed,
  selectedKey,
  onReveal,
  inventoryByName,
}: CardViewProps) {
  const grab = useCardGrabV1();
  return (
    <ul className="text-sm">
      {cards.map((card) => (
        <li
          key={card.cardKey}
          onPointerDown={(event) => grab?.beginPress(card, event)}
          className={`flex items-center gap-2 py-0.5 transition ${
            selectedKey === card.cardKey
              ? "text-[var(--accent-hi)]"
              : dimmed?.has(card.cardKey)
                ? "opacity-30"
                : ""
          } ${grab?.heldKey === card.cardKey ? "professor-mtg-grab-source" : ""}`}
        >
          <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-lo)]">
            {card.copies}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <CardNameHoverPreview
              name={card.name}
              overlay={overlayFor(card, inventoryByName)}
              onClick={() => onReveal?.(card)}
            />
          </span>
          {card.display?.manaCost ? <ManaCost cost={card.display.manaCost} /> : null}
        </li>
      ))}
    </ul>
  );
}
