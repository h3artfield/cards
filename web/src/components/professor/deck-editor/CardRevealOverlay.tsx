"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DECK_BOARD_LABELS_V1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckBoardV1, DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import {
  scryfallCardPageUrlV1,
  tcgplayerCardSearchUrlV1,
} from "./card-links-v1";
import { ManaCost } from "./ManaCost";
import { MarkerChips } from "./MarkerChips";
import type { DeckEditorCard } from "./types";

/**
 * A card, held up.
 *
 * At grid density a tile is about ninety pixels wide, so tapping one has to be
 * able to answer "what is this and why is it here" — which means the printed
 * card at a readable size next to the Professor's reasoning for choosing it.
 * That pairing is the thing this editor has that Moxfield and Archidekt do not,
 * and a tooltip is the wrong place for it because you cannot read a paragraph
 * that disappears when the pointer moves.
 *
 * Every action offered here is also reachable by dragging the card, on purpose:
 * the drag is faster once you know it exists, and this is where you find out.
 */

function destinations(board: DeckBoardV1): DeckBoardV1[] {
  switch (board) {
    case "mainboard":
      return ["considering", "cut"];
    case "considering":
      return ["mainboard", "cut"];
    case "cut":
      return ["mainboard", "considering"];
  }
}

export function CardRevealOverlay({
  card,
  markers,
  imageUrl,
  inventory,
  tcgPrice,
  cartEligible,
  synergySelected,
  onCart,
  onSynergy,
  onMove,
  onRemove,
  onClose,
}: {
  card: DeckEditorCard;
  markers: readonly DeckMarkerV1[];
  imageUrl?: string;
  inventory?: ProfessorDeckInventoryEntryV43;
  tcgPrice?: number | null;
  cartEligible: boolean;
  synergySelected: boolean;
  onCart: () => void;
  onSynergy: () => void;
  onMove: (board: DeckBoardV1) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inStock = (inventory?.quantity ?? 0) > 0;
  const shopPrice = inventory?.listPrice ?? null;
  const why = card.professor?.whyInThisDeck?.trim();

  return createPortal(
    <div
      className="professor-mtg-reveal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onClick={onClose}
    >
      {/* Clicks inside the card must not reach the scrim's dismiss. */}
      <div
        className="professor-mtg-reveal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="professor-mtg-reveal-art">
          {imageUrl ? (
            <img src={imageUrl} alt={card.name} className="block w-full rounded-[4.5%]" />
          ) : (
            <span className="professor-mtg-reveal-art-fallback">{card.name}</span>
          )}
        </div>

        <div className="professor-mtg-reveal-body">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="professor-mtg-reveal-name">{card.name}</h2>
              {card.display?.typeLine ? (
                <p className="professor-mtg-muted mt-0.5 text-[11px]">{card.display.typeLine}</p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              className="professor-mtg-icon-btn shrink-0"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ManaCost cost={card.display?.manaCost} />
            <span className="professor-mtg-muted text-[11px]">
              {card.copies > 1 ? `${card.copies} copies · ` : ""}
              on {DECK_BOARD_LABELS_V1[card.board]}
            </span>
            {inStock ? (
              <span className="text-[11px] text-[var(--ok)]">
                {inventory?.quantity} on our shelf
                {shopPrice != null && shopPrice > 0 ? ` · $${shopPrice.toFixed(2)}` : ""}
              </span>
            ) : tcgPrice != null && tcgPrice > 0 ? (
              <span className="professor-mtg-muted text-[11px]">TCG ${tcgPrice.toFixed(2)}</span>
            ) : null}
          </div>

          <div className="mt-1.5">
            <MarkerChips card={card} markers={markers} />
          </div>

          {why ? (
            <div className="professor-mtg-reveal-why">
              {card.professor?.primaryRole ? (
                <p className="professor-mtg-label text-[9px]">
                  {card.professor.primaryRole.replace(/[_-]+/g, " ")}
                  {card.professor.structuralNecessity === "REQUIRED" ? " · load-bearing" : null}
                </p>
              ) : null}
              <p className="professor-mtg-muted mt-1 text-[11px] leading-snug">{why}</p>
            </div>
          ) : null}

          <div className="professor-mtg-reveal-actions">
            <button
              type="button"
              className="professor-mtg-btn px-2.5 py-1.5 text-[11px]"
              aria-pressed={synergySelected}
              onClick={() => {
                onSynergy();
                onClose();
              }}
            >
              {synergySelected ? "Hide synergy" : "Show synergy"}
            </button>

            {cartEligible ? (
              <button
                type="button"
                className="professor-mtg-btn professor-mtg-btn--ok px-2.5 py-1.5 text-[11px]"
                onClick={() => {
                  onCart();
                  onClose();
                }}
              >
                Add to cart
              </button>
            ) : null}

            {destinations(card.board).map((board) => (
              <button
                key={board}
                type="button"
                className="professor-mtg-btn px-2.5 py-1.5 text-[11px]"
                onClick={() => {
                  onMove(board);
                  onClose();
                }}
              >
                Move to {DECK_BOARD_LABELS_V1[board]}
              </button>
            ))}

            {onRemove ? (
              <button
                type="button"
                className="professor-mtg-btn professor-mtg-btn--danger px-2.5 py-1.5 text-[11px]"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
              >
                Remove
              </button>
            ) : null}
          </div>

          <div className="professor-mtg-reveal-links">
            <a href={scryfallCardPageUrlV1(card.name)} target="_blank" rel="noreferrer">
              Oracle text & rulings
            </a>
            <a href={tcgplayerCardSearchUrlV1(card.name)} target="_blank" rel="noreferrer">
              TCGplayer
            </a>
          </div>

          <p className="professor-mtg-reveal-tip">
            Tip: press and hold a card to pick it up and drop it into Cart, Bench or Cut.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
