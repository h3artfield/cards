/**
 * Type line and mana cost, resolved at read time.
 *
 * These are not stored on the deck for the same reason the derived markers are
 * not: they belong to the card, not to this customer's copy of it, and a stored
 * copy is a second source of truth that can only ever drift. Every request that
 * opens a deck already loads the catalog to check legality, so resolving them
 * costs a map lookup per card.
 *
 * Without them the editor cannot group by card type, which is the default view
 * in every deck editor a player has used.
 */
import { lookupGoldenByName } from "../../../scripts/lib/load-golden-catalog-index";
import { solDirectedDisplayCategoryForTypeLineV1 } from "../deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import type { SolDirectedDeckDisplayCategory } from "../deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import type { EditableDeckCardV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_DISPLAY_FACTS_V1_VERSION =
  "professor-deck-editor-display-facts-v1";

export type DeckEditorDisplayFactsV1 = {
  typeLine: string;
  manaCost: string | null;
  manaValue: number | null;
  /**
   * Null when the catalog has never heard of the card. The editor gives those
   * their own section rather than filing them under a type they might not be —
   * the legality report flags the same cards as unresolved, so a player who
   * mistyped a name can find and fix it in one place.
   */
  category: SolDirectedDeckDisplayCategory | null;
  /** Colors this card can add, from Scryfall `produced_mana`. */
  producedMana?: string[];
  /** Used as a land-source fallback when `producedMana` is empty. */
  colorIdentity?: string[];
  /**
   * True for lands that go ahead of the one-land-per-turn rule: tap for two or
   * more, or search up extra lands. Tap-for-one duals are not this.
   */
  manaAcceleration?: boolean;
};

const MULTI_MANA_ADD_V1 =
  /Add (?:\{[^}]+\}){2,}|Add (?:two|three|four|five|six|seven|eight|ten|x) mana|Add \{[^}]+\} for each|Add an amount of/i;
const EXTRA_LAND_SEARCH_V1 =
  /search your library for (?:up to )?(?:two|three|four|\d+).{0,40}land|play an additional land|an additional land/i;

function oracleTextOf(card: GoldenCatalogOracleCard): string {
  const faces = (card.cardFaces ?? []).map((face) => face.oracleText ?? "").join(" ");
  return `${card.oracleText ?? ""} ${faces}`;
}

function isLandCard(card: GoldenCatalogOracleCard): boolean {
  return (card.types ?? []).includes("Land") || /\bLand\b/.test(card.typeLine ?? "");
}

/** Display-only: lands that actually accelerate, not every tap-for-one source. */
export function landManaAccelerationFromOracleV1(typeLine: string, oracleText: string): boolean {
  if (!/\bLand\b/i.test(typeLine)) return false;
  return MULTI_MANA_ADD_V1.test(oracleText) || EXTRA_LAND_SEARCH_V1.test(oracleText);
}

export type DeckEditorDisplayFactsLookupV1 = (
  card: EditableDeckCardV1,
) => DeckEditorDisplayFactsV1 | null;

function factsFromCard(card: GoldenCatalogOracleCard): DeckEditorDisplayFactsV1 {
  const typeLine = card.typeLine ?? "";
  return {
    typeLine,
    manaCost: card.manaCost ?? null,
    manaValue: typeof card.manaValue === "number" ? card.manaValue : null,
    category: solDirectedDisplayCategoryForTypeLineV1(typeLine),
    producedMana: [...(card.producedMana ?? [])],
    colorIdentity: [...(card.colorIdentity ?? [])],
    manaAcceleration: isLandCard(card)
      ? landManaAccelerationFromOracleV1(typeLine, oracleTextOf(card))
      : false,
  };
}

export function createCatalogDisplayFactsLookupV1(
  catalog: DeckResolutionCatalog,
): DeckEditorDisplayFactsLookupV1 {
  return (card) => {
    const oracleId = card.oracleId?.trim();
    if (oracleId) {
      const byId = catalog.byOracleId.get(oracleId);
      if (byId) return factsFromCard(byId);
    }
    const byName = lookupGoldenByName(catalog, card.name);
    return byName ? factsFromCard(byName) : null;
  };
}

/**
 * Display facts for a card, falling back to what the deck itself knows.
 *
 * A land the catalog cannot resolve still belongs in the Lands section — the
 * deck records `isLand` for exactly the Professor's land base, which carries no
 * oracle ids. Anything else unresolved gets a null category and its own
 * section, rather than being filed under a type it might not be.
 */
export function displayFactsForCardV1(
  card: EditableDeckCardV1,
  lookup: DeckEditorDisplayFactsLookupV1,
): DeckEditorDisplayFactsV1 {
  const resolved = lookup(card);
  if (resolved) return resolved;
  return {
    typeLine: card.isLand ? "Land" : "",
    manaCost: null,
    manaValue: null,
    category: card.isLand ? "land" : null,
    producedMana: [],
    colorIdentity: [],
    manaAcceleration: false,
  };
}

export type EditableDeckCardWithDisplayFactsV1 = EditableDeckCardV1 & {
  display: DeckEditorDisplayFactsV1;
};

export function withDisplayFactsV1<T extends EditableDeckCardV1>(
  cards: readonly T[],
  lookup: DeckEditorDisplayFactsLookupV1,
): Array<T & { display: DeckEditorDisplayFactsV1 }> {
  return cards.map((card) => ({ ...card, display: displayFactsForCardV1(card, lookup) }));
}
