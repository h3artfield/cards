/**
 * Turns an untrusted request body into edit operations.
 *
 * The reducer is total over its own type but says nothing about JSON that
 * merely resembles that type. Without this layer a client could send
 * `{ op: "setCopies", copies: "4" }` and store a string where the deck count
 * arithmetic expects a number, or invent an `op` the reducer silently drops.
 * Everything the reducer trusts is established here.
 */
import { DECK_BOARDS_V1 } from "./types-v1";
import type { DeckBoardV1, DeckMarkerScopeV1 } from "./types-v1";
import type { DeckEditOpV1 } from "./ops-v1";

export const PROFESSOR_DECK_EDITOR_PARSE_OPS_V1_VERSION = "professor-deck-editor-parse-ops-v1";

/**
 * A drag that reorders a categorised list can legitimately emit a handful of
 * operations at once. Anything approaching a hundred is a client bug or an
 * attempt to make the server do unbounded work in one transaction.
 */
const MAX_OPS_PER_REQUEST_V1 = 100;

export type ParseDeckEditOpsResultV1 =
  | { ok: true; ops: DeckEditOpV1[] }
  | { ok: false; message: string };

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoard(value: unknown): DeckBoardV1 | null {
  const board = asString(value);
  return board && (DECK_BOARDS_V1 as readonly string[]).includes(board)
    ? (board as DeckBoardV1)
    : null;
}

function asScope(value: unknown): DeckMarkerScopeV1 | null {
  return value === "deck" || value === "global" ? value : null;
}

/** Rejects `NaN`, `Infinity`, and numeric strings alike. */
function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function parseOne(raw: unknown, index: number): DeckEditOpV1 | string {
  if (typeof raw !== "object" || raw === null) {
    return `Operation ${index} is not an object`;
  }
  const input = raw as Record<string, unknown>;
  const op = asString(input.op);
  if (!op) return `Operation ${index} is missing an "op"`;

  const cardKey = asString(input.cardKey);
  const markerId = asString(input.markerId);

  switch (op) {
    case "addCard": {
      const name = asString(input.name);
      if (!name) return `Operation ${index}: addCard needs a name`;
      const board = asBoard(input.board);
      if (!board) return `Operation ${index}: addCard needs a valid board`;
      const copies = input.copies === undefined ? undefined : asInteger(input.copies);
      if (copies === null) return `Operation ${index}: copies must be a whole number`;
      return {
        op: "addCard",
        // A missing oracle id is normal — a land typed by hand has none — so it
        // becomes null rather than an error.
        oracleId: asString(input.oracleId),
        name,
        board,
        copies,
        isLand: typeof input.isLand === "boolean" ? input.isLand : undefined,
      };
    }

    case "removeCard": {
      if (!cardKey) return `Operation ${index}: removeCard needs a cardKey`;
      return { op: "removeCard", cardKey };
    }

    case "moveCard": {
      if (!cardKey) return `Operation ${index}: moveCard needs a cardKey`;
      const board = asBoard(input.board);
      if (!board) return `Operation ${index}: moveCard needs a valid board`;
      return { op: "moveCard", cardKey, board };
    }

    case "setCopies": {
      if (!cardKey) return `Operation ${index}: setCopies needs a cardKey`;
      const copies = asInteger(input.copies);
      if (copies === null) return `Operation ${index}: copies must be a whole number`;
      return { op: "setCopies", cardKey, copies };
    }

    case "createMarker": {
      const label = asString(input.label);
      if (!label) return `Operation ${index}: createMarker needs a label`;
      const scope = asScope(input.scope);
      if (!scope) return `Operation ${index}: scope must be "deck" or "global"`;
      return { op: "createMarker", label, scope };
    }

    case "deleteMarker": {
      if (!markerId) return `Operation ${index}: deleteMarker needs a markerId`;
      return { op: "deleteMarker", markerId };
    }

    case "assignMarker": {
      if (!cardKey) return `Operation ${index}: assignMarker needs a cardKey`;
      if (!markerId) return `Operation ${index}: assignMarker needs a markerId`;
      return { op: "assignMarker", cardKey, markerId };
    }

    case "unassignMarker": {
      if (!cardKey) return `Operation ${index}: unassignMarker needs a cardKey`;
      if (!markerId) return `Operation ${index}: unassignMarker needs a markerId`;
      return { op: "unassignMarker", cardKey, markerId };
    }

    case "setPrimaryMarker": {
      if (!cardKey) return `Operation ${index}: setPrimaryMarker needs a cardKey`;
      // Null is meaningful here: it clears the grouping marker.
      if (input.markerId !== null && !markerId) {
        return `Operation ${index}: setPrimaryMarker needs a markerId or null`;
      }
      return { op: "setPrimaryMarker", cardKey, markerId: markerId ?? null };
    }

    case "renameDeck": {
      const deckName = asString(input.deckName);
      if (!deckName) return `Operation ${index}: renameDeck needs a deckName`;
      return { op: "renameDeck", deckName };
    }

    case "revertToBaseline":
      return { op: "revertToBaseline" };

    default:
      return `Operation ${index}: "${op}" is not a supported operation`;
  }
}

export function parseDeckEditOpsV1(raw: unknown): ParseDeckEditOpsResultV1 {
  if (!Array.isArray(raw)) return { ok: false, message: "ops must be an array" };
  if (raw.length === 0) return { ok: false, message: "ops must contain at least one operation" };
  if (raw.length > MAX_OPS_PER_REQUEST_V1) {
    return { ok: false, message: `ops is limited to ${MAX_OPS_PER_REQUEST_V1} operations` };
  }

  const ops: DeckEditOpV1[] = [];
  for (const [index, entry] of raw.entries()) {
    const parsed = parseOne(entry, index);
    // A malformed operation fails the whole request. Unlike a rejected-but-valid
    // operation, this means the client is broken, and silently dropping part of
    // a broken request is how you get a UI that disagrees with the server.
    if (typeof parsed === "string") return { ok: false, message: parsed };
    ops.push(parsed);
  }
  return { ok: true, ops };
}
