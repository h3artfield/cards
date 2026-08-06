import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { validateCommanderDeck } from "@/lib/deck-builder/commander-validation";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import type { StoreDeckCard } from "@/lib/deck-builder/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const body = (await req.json()) as {
      commanderScryfallId?: string;
      cards?: StoreDeckCard[];
      targetBracket?: number;
    };

    if (!body.commanderScryfallId || !body.cards) {
      return jsonError("commanderScryfallId and cards are required", 400);
    }

    const ids = [
      body.commanderScryfallId,
      ...body.cards.map((c) => c.scryfallId),
    ];
    const catalogCards = await deckBuilderStore.getCatalogCards(ids);
    const catalogById = new Map(catalogCards.map((c) => [c.id, c]));

    const result = validateCommanderDeck({
      commanderId: body.commanderScryfallId,
      cards: body.cards,
      catalogById,
      targetBracket: body.targetBracket,
    });

    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
