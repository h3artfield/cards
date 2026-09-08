import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { matchProfessorDeckCardsInStoreInventory } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import { searchDeckEditorCardsV1 } from "@/lib/professor-deck-editor/card-search-v1";
import { getEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import { normalizeDeckCardNameV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckBoardV1 } from "@/lib/professor-deck-editor/types-v1";
import { authorizeDeckEditorV1 } from "../authorize";
import { deckIdFromRequestV1 } from "../deck-key";

/**
 * Card search for the deck editor's add-card box.
 *
 * Scoped to a deck rather than global, because the two things that make a
 * result useful — whether the card is inside the commander's colours and
 * whether it is already on a board — are both properties of the deck.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const deckId = deckIdFromRequestV1(req, auth.customerId);
    if (!deckId) return jsonError("buildId or deckId required", 400);

    const deck = await getEditableDeckV1(deckId);
    if (!deck || deck.customerId !== auth.customerId) return jsonError("Deck not found", 404);

    const boardsByOracleId = new Map<string, DeckBoardV1>();
    for (const card of deck.cards) {
      if (card.oracleId) boardsByOracleId.set(card.oracleId, card.board);
    }

    const catalog = await getDeckResolutionCatalogRuntime();
    const result = searchDeckEditorCardsV1({
      catalog,
      query,
      commanderColorIdentity: deck.commander.colorIdentity,
      boardsByOracleId,
    });

    // In-stock flags for the handful of names being shown. This is the whole
    // point of a card-store deck editor, so it is worth a lookup — but a cold
    // inventory cache must cost a badge, not the search.
    let inStockNames = new Set<string>();
    if (result.hits.length > 0) {
      try {
        const match = await matchProfessorDeckCardsInStoreInventory({
          storeSlug: slug,
          cardNames: result.hits.map((hit) => hit.name),
        });
        inStockNames = new Set(match.inStockNames.map((name) => normalizeDeckCardNameV1(name)));
      } catch (err) {
        console.warn("[deck-editor-search] store inventory unavailable:", err);
      }
    }

    return jsonOk({
      query: result.query,
      totalMatches: result.totalMatches,
      hits: result.hits.map((hit) => ({
        ...hit,
        inStock: inStockNames.has(normalizeDeckCardNameV1(hit.name)),
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
