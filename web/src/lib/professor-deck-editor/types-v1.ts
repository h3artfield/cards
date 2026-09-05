/**
 * The editable deck: what a customer owns after the Professor hands off.
 *
 * A sealed build is immutable by design — `ValidatedDeckV111` can only be made
 * by running a validator that rejects any card outside the pool retrieved for
 * that build. That contract proves the Professor built what it claimed, and it
 * must not be loosened to let a person add a card. So an edited deck is a
 * separate object with its own weaker contract (Commander legality), carrying
 * the sealed list as a baseline it can always be reverted to.
 *
 * Two things are deliberately *not* stored here:
 *
 * - Derived markers (in stock, owned, Game Changer, Professor role). They are
 *   computed at read time from inventory, the customer's collection, and the
 *   bracket rubric. Storing them would guarantee they go stale.
 * - Images and prices. Already refetched by the deck panel.
 */
export const PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION = "professor-deck-editor-types-v1";

/**
 * No sideboard: it means nothing in Commander. Archidekt ships both a
 * Maybeboard and a Sideboard and their forum is full of people confused about
 * which is which.
 */
export type DeckBoardV1 = "mainboard" | "considering" | "cut";

export const DECK_BOARDS_V1: readonly DeckBoardV1[] = ["mainboard", "considering", "cut"];

/** Only the mainboard counts toward the 100 and legality. */
export function boardCountsTowardDeckV1(board: DeckBoardV1): boolean {
  return board === "mainboard";
}

export const DECK_BOARD_LABELS_V1: Record<DeckBoardV1, string> = {
  mainboard: "Deck",
  // Archidekt's clearer name for what Moxfield calls a Maybeboard.
  considering: "Considering",
  cut: "Cut",
};

/**
 * What the Professor decided about a card, preserved verbatim.
 *
 * This is expensive to produce and cannot be regenerated cheaply, so it must
 * survive a round trip out to another board and back. Archidekt preserves
 * categories across a maybeboard move for exactly this reason.
 */
export type ProfessorCardProvenanceV1 = {
  primaryArchitectRequirement: string;
  primaryRole: string;
  secondaryRoles: string[];
  packageMembership: string[];
  whyInThisDeck: string;
  structuralNecessity: "REQUIRED" | "FLEX";
};

export type DeckCardOriginV1 = "professor" | "user";

export type EditableDeckCardV1 = {
  /** Stable identity for edit operations. See `deckCardKeyV1`. */
  cardKey: string;
  /** Null only for cards whose identity could not be resolved — chiefly lands. */
  oracleId: string | null;
  name: string;
  /** Above 1 only for basic lands. Legality enforces singleton elsewhere. */
  copies: number;
  board: DeckBoardV1;
  isLand: boolean;
  isBasicLand: boolean;
  origin: DeckCardOriginV1;
  /** Absent for user additions, which have no Professor rationale. */
  professor: ProfessorCardProvenanceV1 | null;
  /** User marker ids. Derived markers are never stored. */
  markerIds: string[];
  /** Which marker groups this card when grouping by marker. */
  primaryMarkerId: string | null;
};

/**
 * A user-defined marker.
 *
 * Follows Moxfield's split: a deck marker lives on one list, a global marker
 * follows the card into every deck the customer owns. Theirs is the model
 * people actually use — generic functions global, deck-specific notes local.
 */
export type DeckMarkerScopeV1 = "deck" | "global";

export type DeckMarkerV1 = {
  id: string;
  label: string;
  scope: DeckMarkerScopeV1;
};

export type EditableDeckCommanderV1 = {
  oracleId: string;
  name: string;
  colorIdentity: string[];
};

export type EditableDeckV1 = {
  version: typeof PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION;
  deckId: string;
  /** The sealed build this came from, or null for a deck started by hand. */
  buildId: string | null;
  customerId: string;
  storeId: string;
  storeSlug: string;
  deckName: string;
  bracket: number;
  commander: EditableDeckCommanderV1;
  cards: EditableDeckCardV1[];
  /** Marker definitions available on this deck, including cached global ones. */
  markers: DeckMarkerV1[];
  /**
   * The Professor's list as shipped, so "restore the Professor's deck" is
   * always available no matter how far the edits have drifted.
   */
  baselineCards: EditableDeckCardV1[];
  /** False until the first accepted edit. Drives the "grade is stale" notice. */
  editedByUser: boolean;
  /** Incremented per accepted edit batch. Used for optimistic concurrency. */
  revision: number;
  createdAt: string;
  updatedAt: string;
};

const BASIC_LAND_NAMES_V1 = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

export function normalizeDeckCardNameV1(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isBasicLandNameV1(name: string): boolean {
  return BASIC_LAND_NAMES_V1.has(normalizeDeckCardNameV1(name));
}

/**
 * Identity for edit operations.
 *
 * Oracle id is preferred, but the constructed deck stores lands as name and
 * copies with no id at all, so a name-based key is required as a fallback
 * rather than dropping every land out of the editor.
 */
export function deckCardKeyV1(args: { oracleId?: string | null; name: string }): string {
  const oracleId = args.oracleId?.trim();
  return oracleId ? `o:${oracleId}` : `n:${normalizeDeckCardNameV1(args.name)}`;
}

/** Slug for a user-typed marker label, so ids stay readable and stable. */
export function deckMarkerIdV1(label: string, scope: DeckMarkerScopeV1): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${scope === "global" ? "g" : "d"}:${slug}`;
}

/** Cards on a given board, in a stable display order. */
export function cardsOnBoardV1(deck: EditableDeckV1, board: DeckBoardV1): EditableDeckCardV1[] {
  return deck.cards
    .filter((card) => card.board === board)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Total physical cards on a board, counting copies. */
export function boardCardCountV1(deck: EditableDeckV1, board: DeckBoardV1): number {
  return deck.cards
    .filter((card) => card.board === board)
    .reduce((sum, card) => sum + card.copies, 0);
}

/**
 * The commander is stored outside `cards`, so the mainboard holds the 99 and
 * the deck total is that plus one.
 */
export function mainboardLibraryCountV1(deck: EditableDeckV1): number {
  return boardCardCountV1(deck, "mainboard");
}
