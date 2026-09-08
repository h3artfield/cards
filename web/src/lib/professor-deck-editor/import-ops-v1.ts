/**
 * A pasted decklist, expressed as edit operations.
 *
 * The parser and catalog hydrator already exist for the Professor's optimize
 * path, so importing a list into a hand-built deck is a translation job rather
 * than a new feature: resolved cards become `addCard` ops and go through the
 * same reducer, the same validation and the same revision check as a card
 * added one at a time. Nothing here writes to a deck directly, which is why it
 * can stay pure and testable.
 *
 * Cards the catalog could not identify are imported anyway, under the name the
 * customer typed. Dropping them would silently shrink a 99-card paste to 96
 * with nothing on screen to say which three went missing; importing them lets
 * the legality report name them as unmatched, which is a problem the customer
 * can actually act on.
 */
import type { ProfessorImportedResolvedCardV111 } from "../deck-synthesis/professor-imported-decklist-v1-1-1";
import type { DeckEditOpV1 } from "./ops-v1";
import type { DeckBoardV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_IMPORT_OPS_V1_VERSION =
  "professor-deck-editor-import-ops-v1";

export function handDeckImportOpsV1(args: {
  cards: readonly ProfessorImportedResolvedCardV111[];
  board?: DeckBoardV1;
}): DeckEditOpV1[] {
  const board = args.board ?? "mainboard";
  const ops: DeckEditOpV1[] = [];

  for (const card of args.cards) {
    const name = (card.resolved ? card.name : card.sourceName).trim();
    if (!name) continue;
    ops.push({
      op: "addCard",
      oracleId: card.resolved ? card.oracleId : null,
      name,
      board,
      copies: Math.max(1, Math.floor(card.copies)),
      isLand: card.isLand,
    });
  }

  return ops;
}
