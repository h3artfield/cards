/**
 * Prefetch deck list images and store inventory during Sol-directed builds
 * so the GUI can render hover art and prices immediately on COMPLETE.
 */
import { matchProfessorDeckCardsInStoreInventory } from "./professor-brew-inventory-match-v4-3-v1";
import type { ProfessorDeckInventoryEntryV43 } from "./professor-brew-inventory-match-v4-3-v1";
import { resolveProfessorBrewCardImageMap } from "./professor-brew-card-images-server-v4-3-v1";
import { resolveProfessorBrewCardTcgPriceMap } from "./professor-brew-scryfall-prices-v1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_DECK_ENRICHMENT_V1_1_1_VERSION =
  "professor-sol-directed-deck-enrichment-v1-1-1";

export type SolDirectedDeckEnrichmentV111 = {
  imageUrls: Record<string, string>;
  inventoryByName: Record<string, ProfessorDeckInventoryEntryV43>;
  tcgPricesByName?: Record<string, number>;
};

export function collectSolDirectedDeckCardNames(deck: SolDirectedConstructedDeckV11): string[] {
  const names = new Set<string>();
  names.add(deck.commander.name.trim());
  for (const card of deck.nonlands) names.add(card.name.trim());
  for (const land of deck.lands) names.add(land.name.trim());
  return [...names].filter(Boolean);
}

export async function enrichSolDirectedDeckForDisplayV111(args: {
  storeSlug: string;
  deck: SolDirectedConstructedDeckV11;
}): Promise<SolDirectedDeckEnrichmentV111> {
  const cardNames = collectSolDirectedDeckCardNames(args.deck);
  if (cardNames.length === 0) {
    return { imageUrls: {}, inventoryByName: {}, tcgPricesByName: {} };
  }

  const [imageUrls, inventoryMatch, tcgPricesByName] = await Promise.all([
    resolveProfessorBrewCardImageMap(cardNames),
    matchProfessorDeckCardsInStoreInventory({ storeSlug: args.storeSlug, cardNames }),
    resolveProfessorBrewCardTcgPriceMap(cardNames),
  ]);

  return {
    imageUrls,
    inventoryByName: inventoryMatch.inventoryByName,
    tcgPricesByName,
  };
}
