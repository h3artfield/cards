import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { runDeckBuilderAgent } from "@/lib/deck-builder/deck-builder-agent";
import {
  buildDeckBuilderInventory,
  getEdhrecRecommendationsEnriched,
  getOrSyncEdhrecMeta,
  resolveStoreBySlug,
} from "@/lib/deck-builder/deck-builder-service";
import { validateCommanderDeck } from "@/lib/deck-builder/commander-validation";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
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
      message?: string;
      commanderSlug?: string;
      commanderName?: string;
      commanderScryfallId?: string;
      themeSlug?: string;
      targetBracket?: number;
      cards?: StoreDeckCard[];
    };

    if (!body.message?.trim()) {
      return jsonError("message is required", 400);
    }
    if (!body.commanderSlug || !body.commanderScryfallId) {
      return jsonError("commanderSlug and commanderScryfallId are required", 400);
    }

    const meta = await getOrSyncEdhrecMeta({
      commanderSlug: body.commanderSlug,
      themeSlug: body.themeSlug,
    });

    const inventory = await buildDeckBuilderInventory({
      storeId: store.id,
      commanderColorIdentity: meta?.colorIdentity ?? [],
      edhrecMeta: meta,
      limit: 100,
    });

    const recommendations = meta
      ? await getEdhrecRecommendationsEnriched({
          storeId: store.id,
          edhrecMeta: meta,
          limit: 80,
        })
      : [];

    const deckCards = body.cards ?? [];
    const ids = [
      body.commanderScryfallId,
      ...deckCards.map((c) => c.scryfallId),
    ];
    const catalogCards = await deckBuilderStore.getCatalogCards(ids);
    const catalogById = new Map(catalogCards.map((c) => [c.id, c]));
    const validation = validateCommanderDeck({
      commanderId: body.commanderScryfallId,
      cards: deckCards,
      catalogById,
      targetBracket: body.targetBracket,
    });

    const response = await runDeckBuilderAgent({
      message: body.message.trim(),
      commanderName: body.commanderName ?? meta?.commanderName ?? body.commanderSlug,
      themeSlug: body.themeSlug,
      targetBracket: body.targetBracket,
      deckCards,
      inventory,
      recommendations,
      deckSummary: {
        mainCount: validation.mainCount,
        gameChangerCount: validation.gameChangerCount,
        valid: validation.valid,
      },
    });

    return jsonOk(response);
  } catch (err) {
    return handleRouteError(err);
  }
}
