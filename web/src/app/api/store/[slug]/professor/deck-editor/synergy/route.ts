/**
 * Which cards in a deck work with which other cards.
 *
 * Separate from the main deck-editor GET on purpose. Building this reads the
 * verified-combo detector tables, which are large, and the answer is only
 * wanted once a player actually clicks a card — so the deck itself keeps
 * loading at the speed it did before this feature existed.
 */
import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import { withSemanticFactsV1 } from "@/lib/professor-deck-editor/semantic-facts-v1";
import { buildDeckSynergyIndexV1 } from "@/lib/professor-deck-editor/synergy-v1";
import { authorizeDeckEditorV1 } from "../authorize";
import { deckIdFromRequestV1 } from "../deck-key";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const deckId = deckIdFromRequestV1(req, auth.customerId!);
    if (!deckId) return jsonError("buildId or deckId required", 400);

    const deck = await getEditableDeckV1(deckId);
    if (!deck || deck.customerId !== auth.customerId) return jsonError("Deck not found", 404);

    const index = await buildDeckSynergyIndexV1({
      deck,
      cards: withSemanticFactsV1(deck.cards),
    });

    return jsonOk({
      revision: deck.revision,
      ...index,
    });
  } catch (error) {
    console.error("[deck-editor/synergy] failed:", error);
    return handleRouteError(error);
  }
}
