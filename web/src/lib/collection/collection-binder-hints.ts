import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import {
  getCommanderSearchCatalogRuntime,
  isPaperEligibleCommanderNameFast,
} from "../deck-synthesis/professor-commander-search-catalog-v1";
import type { CollectionCard } from "../types";

/** Attach type line + commander hint so the binder can highlight and start decks. */
export async function withBinderDeckHints(
  cards: CollectionCard[],
): Promise<CollectionCard[]> {
  if (cards.length === 0) return cards;

  const ids = [
    ...new Set(
      cards
        .filter((card) => card.scryfallId && !card.typeLine)
        .map((card) => card.scryfallId!.trim())
        .filter(Boolean),
    ),
  ];
  const [catalogCards, commanderCatalog] = await Promise.all([
    ids.length ? deckBuilderStore.getCatalogCards(ids) : Promise.resolve([]),
    getCommanderSearchCatalogRuntime(),
  ]);
  const byId = new Map(catalogCards.map((card) => [card.id, card]));

  return cards.map((card) => {
    const cat = card.scryfallId ? byId.get(card.scryfallId) : undefined;
    const typeLine = card.typeLine ?? cat?.typeLine;
    const category = card.category ?? "magic";
    // Same list the deck editor uses — not catalog.isCommander or type-line guesses.
    const canBeCommander =
      !card.needsReview &&
      category === "magic" &&
      isPaperEligibleCommanderNameFast(commanderCatalog, card.displayName);
    return { ...card, typeLine, canBeCommander };
  });
}

export async function withBinderDeckHint(
  card: CollectionCard,
): Promise<CollectionCard> {
  const [next] = await withBinderDeckHints([card]);
  return next ?? card;
}
