"use client";

import { useState } from "react";
import { DECK_BOARD_LABELS_V1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckBoardV1, DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import { CardNameHoverPreview } from "../CardNameHoverPreview";
import { CardMarkerMenu } from "./CardMarkerMenu";
import { ManaCost } from "./ManaCost";
import { MarkerChips } from "./MarkerChips";
import { useCardGrabV1 } from "./card-grab-v1";
import { overlayTone } from "@/lib/collection/owned-index";
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
  considering: "Bench",
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
  onMakeCommander,
  onSetCopies,
  onToggleMarker,
  onCreateAndAssignMarker,
  onDeleteMarker,
  onSynergy,
  synergySelected,
  synergyDimmed,
  onReveal,
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
  onMakeCommander?: () => void;
  onSetCopies: (copies: number) => void;
  onToggleMarker: (markerId: string, assign: boolean) => void;
  onCreateAndAssignMarker: (label: string, scope: "deck" | "global") => void;
  onDeleteMarker: (markerId: string) => void;
  /** Light up what this card works with. */
  onSynergy: () => void;
  /** True while this is the card whose synergies are being shown. */
  synergySelected?: boolean;
  /** True when a synergy selection is active and this card is not part of it. */
  synergyDimmed?: boolean;
  onReveal?: (card: DeckEditorCard) => void;
}) {
  const overlay = card.copyOwnership
    ? overlayTone(card.copyOwnership)
    : inventory && inventory.quantity > 0
      ? "buy_here"
      : "none";
  const buyHere = overlay === "buy_here" || overlay === "mixed";
  const shopPrice =
    buyHere && inventory?.listPrice != null && inventory.listPrice > 0 ? inventory.listPrice : null;

  // The Professor's reasoning for this exact card. It is the one thing this
  // editor has that Moxfield and Archidekt cannot show, and it is what makes a
  // cut an informed decision rather than a guess — so it gets a real disclosure
  // on the row, not a tooltip that vanishes when the pointer moves.
  const [whyOpen, setWhyOpen] = useState(false);
  const why = card.professor?.whyInThisDeck?.trim();

  // A row can be picked up too. The buttons at either end mark themselves
  // `data-grab-ignore`, so pressing one does not also lift the card.
  const grab = useCardGrabV1();

  return (
    <div
      onPointerDown={(event) => grab?.beginPress(card, event)}
      className={`professor-mtg-card-row professor-mtg-editor-row group flex flex-col gap-1 py-1.5 last:border-b-0 transition-opacity ${
        card.board === "cut" ? "professor-mtg-editor-row--dimmed" : ""
      } ${synergyDimmed ? "professor-mtg-editor-row--muted" : ""} ${
        synergySelected ? "bg-[var(--accent-wash)]" : ""
      } ${grab?.heldKey === card.cardKey ? "professor-mtg-grab-source" : ""}`}
    >
      {/* `relative` anchors the action cluster, which is lifted out of flow so
          it stops reserving width from the card name. */}
      <div className="relative flex items-center gap-2">
        {card.isBasicLand ? (
          <span data-grab-ignore className="flex shrink-0 items-center">
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
            prices come and go. The class already clips with an ellipsis.

            The floor matters more than the ceiling. `min-w-0` alone let the
            name shrink to nothing whenever the rest of the row asked for more
            than the column had, which is how names became single letters. A
            name clipped at 8rem is still a name; clipped at 2rem it is not. */}
        <CardNameHoverPreview
          name={card.name}
          imageUrl={imageUrl}
          overlay={overlay}
          className="min-w-[6rem] max-w-[17rem] shrink sm:min-w-[8rem]"
          onClick={() => onReveal?.(card)}
        />
        <ManaCost cost={card.display?.manaCost} />

        {/* Chips yield before the name does: which tags a card carries is
            worth less than knowing which card it is. */}
        <span className="min-w-0 shrink overflow-hidden">
          <MarkerChips card={card} markers={markers} />
        </span>

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

        <span
          data-grab-ignore
          className="professor-mtg-row-actions flex shrink-0 items-center gap-1"
        >
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
          <button
            type="button"
            className="professor-mtg-icon-btn"
            aria-pressed={Boolean(synergySelected)}
            title={`Show what ${card.name} works with`}
            onClick={onSynergy}
          >
            Synergy
          </button>
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
          {onMakeCommander ? (
            <button
              type="button"
              className="professor-mtg-icon-btn"
              title={`Make ${card.name} the commander`}
              onClick={onMakeCommander}
            >
              Cmd
            </button>
          ) : null}
          <CardMarkerMenu
            card={card}
            markers={markers}
            onToggle={onToggleMarker}
            onCreateAndAssign={onCreateAndAssignMarker}
            onDeleteMarker={onDeleteMarker}
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
