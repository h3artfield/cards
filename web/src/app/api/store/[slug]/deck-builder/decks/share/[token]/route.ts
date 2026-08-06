import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import {
  deckToMoxfieldExport,
  validateCommanderDeck,
} from "@/lib/deck-builder/commander-validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  try {
    const { slug, token } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const deck = await deckBuilderStore.getStoreDeckByShareToken(token);
    if (!deck || deck.storeId !== store.id) {
      return jsonError("Deck not found", 404);
    }

    const ids = [
      deck.commanderScryfallId,
      ...deck.cards.map((c) => c.scryfallId),
    ];
    const catalogCards = await deckBuilderStore.getCatalogCards(ids);
    const catalogById = new Map(catalogCards.map((c) => [c.id, c]));
    const commander = catalogById.get(deck.commanderScryfallId);

    const validation = validateCommanderDeck({
      commanderId: deck.commanderScryfallId,
      cards: deck.cards,
      catalogById,
      targetBracket: deck.targetBracket,
    });

    const exportText = deckToMoxfieldExport({
      commanderName: deck.commanderName ?? commander?.name ?? "Commander",
      cards: deck.cards,
      catalogById,
    });

    return jsonOk({
      deck,
      validation,
      exportText,
      catalogCards,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
