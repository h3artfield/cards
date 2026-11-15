/**
 * Deck edits as explicit operations against a revision.
 *
 * The API takes operations rather than a whole deck for two reasons. A full-deck
 * PUT from a stale client silently discards edits made anywhere else, and it
 * also lets a client overwrite fields it has no business setting — the Professor
 * provenance, the baseline, the origin flags. An operation list can only
 * express changes a user is actually allowed to make.
 *
 * Everything here is pure. No catalog, no network, no clock beyond the caller's
 * timestamp, so the whole edit surface is testable without infrastructure.
 */
import { deckCardKeyV1, deckMarkerIdV1, isBasicLandNameV1 } from "./types-v1";
import type {
  DeckBoardV1,
  DeckMarkerScopeV1,
  DeckMarkerV1,
  EditableDeckCardV1,
  EditableDeckCommanderV1,
  EditableDeckV1,
} from "./types-v1";

export const PROFESSOR_DECK_EDITOR_OPS_V1_VERSION = "professor-deck-editor-ops-v1";

export type DeckEditOpV1 =
  | {
      op: "addCard";
      oracleId: string | null;
      name: string;
      board: DeckBoardV1;
      copies?: number;
      isLand?: boolean;
    }
  | { op: "removeCard"; cardKey: string }
  | { op: "moveCard"; cardKey: string; board: DeckBoardV1 }
  | { op: "setCopies"; cardKey: string; copies: number }
  | { op: "createMarker"; label: string; scope: DeckMarkerScopeV1 }
  | { op: "deleteMarker"; markerId: string }
  | { op: "assignMarker"; cardKey: string; markerId: string }
  | { op: "unassignMarker"; cardKey: string; markerId: string }
  | { op: "setPrimaryMarker"; cardKey: string; markerId: string | null }
  | { op: "renameDeck"; deckName: string }
  | {
      /**
       * Promote a card to the command zone. The current commander is demoted
       * into the mainboard; if the new commander was already in the 99 it is
       * removed from `cards` so it is not counted twice.
       */
      op: "setCommander";
      oracleId: string;
      name: string;
      colorIdentity: string[];
    }
  | { op: "revertToBaseline" };

export type DeckEditRejectionV1 = {
  /** Index in the submitted operation list, so a client can point at the row. */
  index: number;
  op: DeckEditOpV1["op"];
  reason: string;
};

export type DeckEditOutcomeV1 = {
  deck: EditableDeckV1;
  applied: number;
  rejected: DeckEditRejectionV1[];
  /** True when the deck actually changed, so callers can skip a pointless write. */
  changed: boolean;
};

const MAX_COPIES_V1 = 99;
const MAX_MARKER_LABEL_V1 = 40;
const MAX_DECK_NAME_V1 = 120;

function findCard(deck: EditableDeckV1, cardKey: string): EditableDeckCardV1 | undefined {
  return deck.cards.find((card) => card.cardKey === cardKey);
}

function replaceCard(
  deck: EditableDeckV1,
  cardKey: string,
  change: (card: EditableDeckCardV1) => EditableDeckCardV1,
): EditableDeckV1 {
  return {
    ...deck,
    cards: deck.cards.map((card) => (card.cardKey === cardKey ? change(card) : card)),
  };
}

/**
 * A card leaving the mainboard keeps everything about itself.
 *
 * Moving to Considering or Cut is not deleting — the whole point is being able
 * to bring it back unchanged, including the Professor's reasoning, which cannot
 * be regenerated without another model call.
 */
function moveCardToBoard(card: EditableDeckCardV1, board: DeckBoardV1): EditableDeckCardV1 {
  return { ...card, board };
}

function applyOne(
  deck: EditableDeckV1,
  op: DeckEditOpV1,
): { deck: EditableDeckV1; reason?: string } {
  switch (op.op) {
    case "addCard": {
      const name = op.name.trim();
      if (!name) return { deck, reason: "A card name is required" };

      const cardKey = deckCardKeyV1({ oracleId: op.oracleId, name });
      const existing = findCard(deck, cardKey);
      if (existing) {
        // Re-adding a card the deck already holds elsewhere moves it rather
        // than creating a duplicate the legality check would then reject.
        if (existing.board === op.board) {
          return { deck, reason: `${name} is already on the ${op.board}` };
        }
        return { deck: replaceCard(deck, cardKey, (card) => moveCardToBoard(card, op.board)) };
      }

      const isBasicLand = isBasicLandNameV1(name);
      const copies = Math.floor(op.copies ?? 1);
      if (copies < 1 || copies > MAX_COPIES_V1) {
        return { deck, reason: `Copies must be between 1 and ${MAX_COPIES_V1}` };
      }
      if (copies > 1 && !isBasicLand) {
        return { deck, reason: `${name} is not a basic land, so it is limited to one copy` };
      }

      const card: EditableDeckCardV1 = {
        cardKey,
        oracleId: op.oracleId?.trim() || null,
        name,
        copies,
        board: op.board,
        isLand: op.isLand ?? isBasicLand,
        isBasicLand,
        origin: "user",
        professor: null,
        markerIds: [],
        primaryMarkerId: null,
      };
      return { deck: { ...deck, cards: [...deck.cards, card] } };
    }

    case "removeCard": {
      if (!findCard(deck, op.cardKey)) return { deck, reason: "That card is not in this deck" };
      return { deck: { ...deck, cards: deck.cards.filter((c) => c.cardKey !== op.cardKey) } };
    }

    case "moveCard": {
      const card = findCard(deck, op.cardKey);
      if (!card) return { deck, reason: "That card is not in this deck" };
      if (card.board === op.board) return { deck, reason: `Already on the ${op.board}` };
      return { deck: replaceCard(deck, op.cardKey, (c) => moveCardToBoard(c, op.board)) };
    }

    case "setCopies": {
      const card = findCard(deck, op.cardKey);
      if (!card) return { deck, reason: "That card is not in this deck" };
      const copies = Math.floor(op.copies);
      if (copies < 1 || copies > MAX_COPIES_V1) {
        return { deck, reason: `Copies must be between 1 and ${MAX_COPIES_V1}` };
      }
      if (copies > 1 && !card.isBasicLand) {
        return { deck, reason: `${card.name} is not a basic land, so it is limited to one copy` };
      }
      return { deck: replaceCard(deck, op.cardKey, (c) => ({ ...c, copies })) };
    }

    case "createMarker": {
      const label = op.label.trim();
      if (!label) return { deck, reason: "A marker needs a label" };
      if (label.length > MAX_MARKER_LABEL_V1) {
        return { deck, reason: `Marker labels are limited to ${MAX_MARKER_LABEL_V1} characters` };
      }
      const id = deckMarkerIdV1(label, op.scope);
      if (id === `${op.scope === "global" ? "g" : "d"}:`) {
        return { deck, reason: "That label has no usable characters" };
      }
      if (deck.markers.some((m) => m.id === id)) {
        return { deck, reason: `A ${op.scope} marker called ${label} already exists` };
      }
      const marker: DeckMarkerV1 = { id, label, scope: op.scope };
      return { deck: { ...deck, markers: [...deck.markers, marker] } };
    }

    case "deleteMarker": {
      if (!deck.markers.some((m) => m.id === op.markerId)) {
        return { deck, reason: "That marker does not exist on this deck" };
      }
      // Deleting the definition must also clear every assignment, or cards keep
      // pointing at a marker that no longer resolves to a label.
      return {
        deck: {
          ...deck,
          markers: deck.markers.filter((m) => m.id !== op.markerId),
          cards: deck.cards.map((card) => ({
            ...card,
            markerIds: card.markerIds.filter((id) => id !== op.markerId),
            primaryMarkerId: card.primaryMarkerId === op.markerId ? null : card.primaryMarkerId,
          })),
        },
      };
    }

    case "assignMarker": {
      const card = findCard(deck, op.cardKey);
      if (!card) return { deck, reason: "That card is not in this deck" };
      if (!deck.markers.some((m) => m.id === op.markerId)) {
        return { deck, reason: "Create the marker before assigning it" };
      }
      if (card.markerIds.includes(op.markerId)) {
        return { deck, reason: `${card.name} already has that marker` };
      }
      return {
        deck: replaceCard(deck, op.cardKey, (c) => ({
          ...c,
          markerIds: [...c.markerIds, op.markerId],
          // First marker becomes the grouping marker, so grouping by marker
          // works without a second deliberate step.
          primaryMarkerId: c.primaryMarkerId ?? op.markerId,
        })),
      };
    }

    case "unassignMarker": {
      const card = findCard(deck, op.cardKey);
      if (!card) return { deck, reason: "That card is not in this deck" };
      if (!card.markerIds.includes(op.markerId)) {
        return { deck, reason: `${card.name} does not have that marker` };
      }
      const remaining = card.markerIds.filter((id) => id !== op.markerId);
      return {
        deck: replaceCard(deck, op.cardKey, (c) => ({
          ...c,
          markerIds: remaining,
          primaryMarkerId:
            c.primaryMarkerId === op.markerId ? (remaining[0] ?? null) : c.primaryMarkerId,
        })),
      };
    }

    case "setPrimaryMarker": {
      const card = findCard(deck, op.cardKey);
      if (!card) return { deck, reason: "That card is not in this deck" };
      if (op.markerId !== null && !card.markerIds.includes(op.markerId)) {
        return { deck, reason: "A primary marker must be one the card already has" };
      }
      return { deck: replaceCard(deck, op.cardKey, (c) => ({ ...c, primaryMarkerId: op.markerId })) };
    }

    case "renameDeck": {
      const deckName = op.deckName.trim();
      if (!deckName) return { deck, reason: "A deck name is required" };
      if (deckName.length > MAX_DECK_NAME_V1) {
        return { deck, reason: `Deck names are limited to ${MAX_DECK_NAME_V1} characters` };
      }
      if (deckName === deck.deckName) return { deck, reason: "The deck already has that name" };
      return { deck: { ...deck, deckName } };
    }

    case "setCommander": {
      const name = op.name.trim();
      const oracleId = op.oracleId.trim();
      if (!name) return { deck, reason: "A commander name is required" };
      if (!oracleId) return { deck, reason: "A commander oracle id is required" };

      const nextCommander: EditableDeckCommanderV1 = {
        oracleId,
        name,
        colorIdentity: op.colorIdentity.map((c) => c.toUpperCase()),
      };

      const sameOracle = deck.commander.oracleId === nextCommander.oracleId;
      const sameName =
        deck.commander.name.trim().toLowerCase() === nextCommander.name.toLowerCase();
      if (sameOracle || sameName) {
        return { deck, reason: `${nextCommander.name} is already the commander` };
      }

      const newKey = deckCardKeyV1({ oracleId: nextCommander.oracleId, name: nextCommander.name });
      const withoutPromoted = deck.cards.filter((card) => card.cardKey !== newKey);

      const oldKey = deckCardKeyV1({
        oracleId: deck.commander.oracleId,
        name: deck.commander.name,
      });
      const demotedAlready = withoutPromoted.some((card) => card.cardKey === oldKey);
      const demoted: EditableDeckCardV1 | null = demotedAlready
        ? null
        : {
            cardKey: oldKey,
            oracleId: deck.commander.oracleId || null,
            name: deck.commander.name,
            copies: 1,
            board: "mainboard",
            isLand: false,
            isBasicLand: false,
            origin: "user",
            professor: null,
            markerIds: [],
            primaryMarkerId: null,
          };

      return {
        deck: {
          ...deck,
          commander: nextCommander,
          cards: demoted ? [...withoutPromoted, demoted] : withoutPromoted,
        },
      };
    }

    case "revertToBaseline": {
      if (deck.baselineCards.length === 0) {
        return { deck, reason: "This deck has no Professor baseline to restore" };
      }
      // Markers are the user's own annotations and survive a revert; only the
      // card list goes back. Assignments to cards no longer present are dropped.
      const baselineKeys = new Set(deck.baselineCards.map((c) => c.cardKey));
      const markersByKey = new Map(
        deck.cards
          .filter((c) => baselineKeys.has(c.cardKey))
          .map((c) => [c.cardKey, { markerIds: c.markerIds, primaryMarkerId: c.primaryMarkerId }]),
      );
      return {
        deck: {
          ...deck,
          cards: deck.baselineCards.map((card) => {
            const kept = markersByKey.get(card.cardKey);
            return kept ? { ...card, ...kept } : { ...card };
          }),
        },
      };
    }

    default: {
      const exhaustive: never = op;
      return { deck, reason: `Unsupported operation: ${JSON.stringify(exhaustive)}` };
    }
  }
}

/**
 * Applies a batch, keeping every operation that succeeds and reporting the rest.
 *
 * A partial batch is deliberate: a drag that also creates a marker should not
 * lose the card move because the marker name collided. Callers that need
 * all-or-nothing can check `rejected` and discard the result.
 */
export function applyDeckEditOpsV1(args: {
  deck: EditableDeckV1;
  ops: readonly DeckEditOpV1[];
  now: string;
}): DeckEditOutcomeV1 {
  let deck = args.deck;
  let applied = 0;
  const rejected: DeckEditRejectionV1[] = [];

  args.ops.forEach((op, index) => {
    const result = applyOne(deck, op);
    if (result.reason) {
      rejected.push({ index, op: op.op, reason: result.reason });
      return;
    }
    deck = result.deck;
    applied += 1;
  });

  if (applied === 0) {
    return { deck: args.deck, applied: 0, rejected, changed: false };
  }

  // A revert restores the Professor's list, so the deck stops counting as
  // edited and the "grade no longer describes this deck" notice goes away.
  const onlyReverted = args.ops.every((op) => op.op === "revertToBaseline");

  return {
    deck: {
      ...deck,
      editedByUser: !onlyReverted,
      revision: deck.revision + 1,
      updatedAt: args.now,
    },
    applied,
    rejected,
    changed: true,
  };
}

