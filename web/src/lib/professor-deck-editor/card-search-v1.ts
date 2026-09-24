/**
 * Card search for the deck editor.
 *
 * The existing `deckBuilderStore.searchCatalogCards` cannot serve this: it
 * filters to `isCommander` and reads only the first 200 documents, so it finds
 * commanders and almost nothing else. This searches the full resolution
 * catalog, which is already loaded and cached in memory for every build, so a
 * keystroke costs a scan rather than a Firestore round trip.
 *
 * Two behaviours are deliberate and worth stating:
 *
 * - Off-colour cards are returned and flagged, not hidden. Someone typing
 *   "Rhystic" into a mono-green deck has made a mistake, and a result that says
 *   why teaches them something; an empty list just looks broken.
 * - Cards already in the deck are returned and flagged too, so the picker can
 *   offer "move back to the deck" instead of silently doing nothing.
 */
import { normalizeOracleName } from "../deck-builder/golden-catalog/normalize-name";
import { mapCommanderFormatStatus } from "../deck-builder/commander-classification";
import { paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import type { DeckBoardV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_CARD_SEARCH_V1_VERSION = "professor-deck-editor-card-search-v1";

export type CardSearchHitV1 = {
  oracleId: string;
  name: string;
  typeLine: string;
  manaCost: string | null;
  manaValue: number | null;
  colorIdentity: string[];
  isLand: boolean;
  isBasicLand: boolean;
  /** Banned or not legal in Commander. Still returned, so the UI can say why. */
  commanderLegal: boolean;
  /**
   * True when this card may sit in the command zone (paper-eligible sole
   * commander). Populated by the search route from the commander catalog; the
   * pure search itself leaves it undefined.
   */
  canBeCommander?: boolean;
  /** Colours this card would add beyond the commander's identity. */
  offColorPips: string[];
  /** Set when the deck already holds this card, naming the board it sits on. */
  alreadyOnBoard: DeckBoardV1 | null;
};

export type CardSearchResultV1 = {
  query: string;
  hits: CardSearchHitV1[];
  /** Total matches before the limit, so the UI can say "showing 25 of 180". */
  totalMatches: number;
};

const DEFAULT_LIMIT_V1 = 25;
const MAX_LIMIT_V1 = 50;
/** Below two characters every query matches thousands of cards uselessly. */
const MIN_QUERY_LENGTH_V1 = 2;

type SearchIndexEntryV1 = {
  oracleId: string;
  /** Normalized primary name, matched against. */
  key: string;
  card: GoldenCatalogOracleCard;
};

type SearchIndexV1 = {
  entries: SearchIndexEntryV1[];
  builtFrom: number;
};

// Rebuilt only when the catalog identity count changes, which in practice means
// once per process. Keyed on the catalog object so a swapped catalog is noticed.
const indexCache = new WeakMap<object, SearchIndexV1>();

function isLandCard(card: GoldenCatalogOracleCard): boolean {
  return (card.types ?? []).includes("Land") || /\bLand\b/.test(card.typeLine ?? "");
}

function isBasicLandCard(card: GoldenCatalogOracleCard): boolean {
  return (card.supertypes ?? []).includes("Basic") && isLandCard(card);
}

/**
 * Cards a person can actually put in a paper deck.
 *
 * Without this the picker offers Alchemy rebalances and other digital-only
 * printings, which cannot be bought at the counter and would fail the
 * Professor's own paper frame.
 */
function isOfferable(catalog: DeckResolutionCatalog, card: GoldenCatalogOracleCard): boolean {
  if (!card.oracleId || !card.canonicalName) return false;
  if (card.layout === "token" || card.layout === "emblem" || card.layout === "art_series") {
    return false;
  }
  return paperMetaForOracle(catalog, card.oracleId).paperEligible;
}

function buildIndex(catalog: DeckResolutionCatalog): SearchIndexV1 {
  const entries: SearchIndexEntryV1[] = [];
  for (const card of catalog.byOracleId.values()) {
    if (!isOfferable(catalog, card)) continue;
    entries.push({
      oracleId: card.oracleId,
      key: normalizeOracleName(card.canonicalName),
      card,
    });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return { entries, builtFrom: catalog.byOracleId.size };
}

function indexFor(catalog: DeckResolutionCatalog): SearchIndexV1 {
  const cached = indexCache.get(catalog);
  if (cached && cached.builtFrom === catalog.byOracleId.size) return cached;
  const built = buildIndex(catalog);
  indexCache.set(catalog, built);
  return built;
}

/**
 * Lower is better. Ordering by how the match was made, not by string distance,
 * because a person typing "sol" wants Sol Ring first and not Consol‑anything.
 */
function matchRank(key: string, query: string): number | null {
  if (key === query) return 0;
  if (key.startsWith(query)) return 1;
  // A later word starting with the query: "ring" should find "Sol Ring".
  if (key.includes(` ${query}`)) return 2;
  if (key.includes(query)) return 3;
  return null;
}

function offColorPips(card: GoldenCatalogOracleCard, commanderColors: readonly string[]): string[] {
  const allowed = new Set(commanderColors.map((c) => c.toUpperCase()));
  return [...(card.colorIdentity ?? [])]
    .map((c) => c.toUpperCase())
    .filter((c) => !allowed.has(c));
}

function toHit(args: {
  card: GoldenCatalogOracleCard;
  commanderColorIdentity: readonly string[];
  boardsByOracleId: ReadonlyMap<string, DeckBoardV1>;
}): CardSearchHitV1 {
  const { card } = args;
  const status = mapCommanderFormatStatus(card.legalities);
  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    typeLine: card.typeLine ?? "",
    manaCost: card.manaCost ?? null,
    manaValue: typeof card.manaValue === "number" ? card.manaValue : null,
    colorIdentity: [...(card.colorIdentity ?? [])],
    isLand: isLandCard(card),
    isBasicLand: isBasicLandCard(card),
    commanderLegal: status !== "banned" && status !== "not_legal",
    offColorPips: offColorPips(card, args.commanderColorIdentity),
    alreadyOnBoard: args.boardsByOracleId.get(card.oracleId) ?? null,
  };
}

export function searchDeckEditorCardsV1(args: {
  catalog: DeckResolutionCatalog;
  query: string;
  commanderColorIdentity: readonly string[];
  /** Oracle ids already in the deck, mapped to the board they sit on. */
  boardsByOracleId?: ReadonlyMap<string, DeckBoardV1>;
  limit?: number;
}): CardSearchResultV1 {
  const query = normalizeOracleName(args.query.trim());
  if (query.length < MIN_QUERY_LENGTH_V1) {
    return { query, hits: [], totalMatches: 0 };
  }

  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT_V1, 1), MAX_LIMIT_V1);
  const boardsByOracleId = args.boardsByOracleId ?? new Map<string, DeckBoardV1>();
  const { entries } = indexFor(args.catalog);

  const scored: Array<{ rank: number; entry: SearchIndexEntryV1 }> = [];
  for (const entry of entries) {
    const rank = matchRank(entry.key, query);
    if (rank !== null) scored.push({ rank, entry });
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      // Among equal-rank matches the shorter name is the more likely intent:
      // "Counterspell" before "Counterspell Consultation".
      a.entry.key.length - b.entry.key.length ||
      a.entry.key.localeCompare(b.entry.key),
  );

  return {
    query,
    totalMatches: scored.length,
    hits: scored.slice(0, limit).map(({ entry }) =>
      toHit({
        card: entry.card,
        commanderColorIdentity: args.commanderColorIdentity,
        boardsByOracleId,
      }),
    ),
  };
}
