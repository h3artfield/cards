"use client";

import { useState } from "react";
import { DECK_BOARD_LABELS_V1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckBoardV1, DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import { CardNameHoverPreview } from "../CardNameHoverPreview";
import { CardMarkerMenu } from "./CardMarkerMenu";
import { ManaCost } from "./ManaCost";
import { MarkerChips } from "./MarkerChips";
import type { DeckEditorCard } from "./types";

/**
 * Where a card can go from where it is.
 *
 * Removal is offered only for cards the customer added. A Professor card is
 * sent to Cut instead, because Cut keeps the per-card rationale and a delete
 * throws away reasoning that cost a model call to produce and cannot be
 * recovered by adding the same card back.
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

const MOVE_LABEL: Record<DeckBoardV1, string> = {
  mainboard: "To deck",
  considering: "Consider",
  cut: "Cut",
};

export function DeckEditorCardRow({
  card,
  markers,
  imageUrl,
  inventory,
  tcgPrice,
  illegalReason,
  onMove,
  onRemove,
  onSetCopies,
  onToggleMarker,
  onCreateAndAssignMarker,
}: {
  card: DeckEditorCard;
  markers: readonly DeckMarkerV1[];
  imageUrl?: string;
  inventory?: ProfessorDeckInventoryEntryV43;
  tcgPrice?: number | null;
  /** Set when the legality report rejects this card, and shown on the row. */
  illegalReason?: string;
  onMove: (board: DeckBoardV1) => void;
  onRemove: () => void;
  onSetCopies: (copies: number) => void;
  onToggleMarker: (markerId: string, assign: boolean) => void;
  onCreateAndAssignMarker: (label: string, scope: "deck" | "global") => void;
}) {
  const inStock = Boolean(inventory && inventory.quantity > 0);
  const shopPrice =
    inStock && inventory?.listPrice != null && inventory.listPrice > 0 ? inventory.listPrice : null;

  // The Professor's reasoning for this exact card. It is the one thing this
  // editor has that Moxfield and Archidekt cannot show, and it is what makes a
  // cut an informed decision rather than a guess — so it gets a real disclosure
  // on the row, not a tooltip that vanishes when the pointer moves.
  const [whyOpen, setWhyOpen] = useState(false);
  const why = card.professor?.whyInThisDeck?.trim();

  return (
    <div
      className={`professor-mtg-card-row professor-mtg-editor-row group flex flex-col gap-1 py-1.5 last:border-b-0 ${
        card.board === "cut" ? "professor-mtg-editor-row--dimmed" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {card.isBasicLand ? (
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              className="professor-mtg-icon-btn"
              aria-label={`One fewer ${card.name}`}
              disabled={card.copies <= 1}
              onClick={() => onSetCopies(card.copies - 1)}
            >
              −
            </button>
            <span className="professor-mtg-body w-6 text-center text-[11px] tabular-nums">
              {card.copies}
            </span>
            <button
              type="button"
              className="professor-mtg-icon-btn"
              aria-label={`One more ${card.name}`}
              onClick={() => onSetCopies(card.copies + 1)}
            >
              +
            </button>
          </span>
        ) : (
          <span className="professor-mtg-muted w-4 shrink-0 text-right text-[11px] tabular-nums">
            {card.copies}
          </span>
        )}

        {/* No `flex-1` here: the spacer below takes the slack, and two growing
            elements in one row make the name column jump about as chips and
            prices come and go. The class already clips with an ellipsis. */}
        <CardNameHoverPreview
          name={card.name}
          imageUrl={imageUrl}
          inStock={inStock}
          className="min-w-0 max-w-[13rem] shrink"
          onClick={why ? () => setWhyOpen((open) => !open) : undefined}
        />
        <ManaCost cost={card.display?.manaCost} />

        <MarkerChips card={card} markers={markers} />

        <span className="flex-1" />

        {shopPrice != null ? (
          <span className="professor-mtg-card-price shrink-0">${shopPrice.toFixed(2)}</span>
        ) : tcgPrice != null && tcgPrice > 0 ? (
          <span
            className="professor-mtg-card-price professor-mtg-card-price--tcg shrink-0"
            title="TCGPlayer market"
          >
            TCG ${tcgPrice.toFixed(2)}
          </span>
        ) : null}

        <span className="professor-mtg-row-actions flex shrink-0 items-center gap-1">
          {why ? (
            <button
              type="button"
              className="professor-mtg-icon-btn"
              aria-expanded={whyOpen}
              title={`Why the Professor picked ${card.name}`}
              onClick={() => setWhyOpen((open) => !open)}
            >
              Why
            </button>
          ) : null}
          {destinations(card.board).map((board) => (
            <button
              key={board}
              type="button"
              className="professor-mtg-icon-btn"
              title={`Move ${card.name} to ${DECK_BOARD_LABELS_V1[board]}`}
              onClick={() => onMove(board)}
            >
              {MOVE_LABEL[board]}
            </button>
          ))}
          <CardMarkerMenu
            card={card}
            markers={markers}
            onToggle={onToggleMarker}
            onCreateAndAssign={onCreateAndAssignMarker}
          />
          {card.origin === "user" ? (
            <button
              type="button"
              className="professor-mtg-icon-btn professor-mtg-icon-btn--danger"
              title={`Remove ${card.name} from this deck`}
              onClick={onRemove}
            >
              ✕
            </button>
          ) : null}
        </span>
      </div>

      {whyOpen && why ? (
        <div className="border-l border-[var(--mtg-gold-dim)] pb-1 pl-2.5 pt-0.5 ml-6">
          {card.professor?.primaryRole ? (
            <p className="professor-mtg-label text-[9px]">
              {card.professor.primaryRole.replace(/[_-]+/g, " ")}
              {card.professor.structuralNecessity === "REQUIRED" ? " · load-bearing" : null}
            </p>
          ) : null}
          <p className="professor-mtg-muted mt-1 text-[11px] leading-snug">{why}</p>
        </div>
      ) : null}

      {illegalReason ? (
        <p className="pl-6 text-[11px] leading-snug text-[#f0a8a0]">{illegalReason}</p>
      ) : null}
    </div>
  );
}
