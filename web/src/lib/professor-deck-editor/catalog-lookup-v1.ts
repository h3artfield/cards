/**
 * Binds the legality contract to the golden catalog.
 *
 * Kept apart from `legality-v1` so the rules stay testable against fixtures
 * rather than against a 30,000-card Firestore load.
 */
import { lookupGoldenByName } from "../../../scripts/lib/load-golden-catalog-index";
import { isPlayableInCommanderFormat } from "../deck-builder/commander-format-legality-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import type { DeckEditorCardFactsLookupV1, DeckEditorCardFactsV1 } from "./legality-v1";
import type { EditableDeckCardV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_CATALOG_LOOKUP_V1_VERSION =
  "professor-deck-editor-catalog-lookup-v1";

function isLandCard(card: GoldenCatalogOracleCard): boolean {
  return (card.types ?? []).includes("Land") || /\bLand\b/.test(card.typeLine ?? "");
}

/**
 * Deck inclusion legality, which is not the same question as commander
 * eligibility.
 *
 * `isCurrentlyCommanderLegal` in the retrieval layer answers "could this sit in
 * the command zone" and returns true for anything the catalog marks as a
 * possible commander — which includes banned legendaries like Golos. For
 * deciding whether a card may be in the 99, only the format legality field is
 * relevant. An absent field reads as legal: the catalog missing data is not
 * evidence against a card, and the unresolved-card path already covers cards
 * the catalog has never heard of.
 */
function isLegalInTheNinetyNine(card: GoldenCatalogOracleCard): boolean {
  return isPlayableInCommanderFormat(card);
}

function factsFrom(card: GoldenCatalogOracleCard): DeckEditorCardFactsV1 {
  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    colorIdentity: [...(card.colorIdentity ?? [])],
    commanderLegal: isLegalInTheNinetyNine(card),
    isLand: isLandCard(card),
  };
}

/**
 * Resolves by oracle id first, then by name.
 *
 * The name path matters more than it looks: the Professor's land base carries
 * no oracle ids, so without it every land in every deck would come back
 * unresolved and the legality report would be nothing but noise.
 */
export function resolveEditorCardFromCatalogV1(args: {
  catalog: DeckResolutionCatalog;
  oracleId?: string | null;
  name: string;
}): DeckEditorCardFactsV1 | null {
  const oracleId = args.oracleId?.trim();
  if (oracleId) {
    const byId = args.catalog.byOracleId.get(oracleId);
    if (byId) return factsFrom(byId);
  }
  const byName = lookupGoldenByName(args.catalog, args.name);
  return byName ? factsFrom(byName) : null;
}

export function createCatalogCardFactsLookupV1(
  catalog: DeckResolutionCatalog,
): DeckEditorCardFactsLookupV1 {
  return (card: EditableDeckCardV1) =>
    resolveEditorCardFromCatalogV1({ catalog, oracleId: card.oracleId, name: card.name });
}

/**
 * Supplies the oracle ids the constructed deck's land entries are missing, so
 * lands get the same stable `o:` keys as everything else.
 */
export function createLandOracleIdResolverV1(
  catalog: DeckResolutionCatalog,
): (name: string) => string | null {
  return (name: string) => lookupGoldenByName(catalog, name)?.oracleId ?? null;
}
