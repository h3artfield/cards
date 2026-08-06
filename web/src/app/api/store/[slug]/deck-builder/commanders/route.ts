import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const commanders = await deckBuilderStore.listEdhrecCommanders(100);
    return jsonOk({
      commanders: commanders.map((c) => ({
        slug: c.commanderSlug,
        name: c.commanderName,
        rank: c.rank,
        numDecks: c.numDecks,
        colorIdentity: c.colorIdentity,
        scryfallId: c.scryfallId,
        themes: c.themes,
        syncedAt: c.syncedAt,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
