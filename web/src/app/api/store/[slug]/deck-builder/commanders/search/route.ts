import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { commanderNameToSlug } from "@/lib/deck-builder/edhrec-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!q) return jsonOk({ results: [] });

    const commanders = await deckBuilderStore.listEdhrecCommanders(500);
    const lower = q.toLowerCase();
    const matches = commanders
      .filter((c) => c.commanderName.toLowerCase().includes(lower))
      .slice(0, 20);

    const catalogMatches = await deckBuilderStore.searchCatalogCards(q, 10);
    const catalogCommanders = catalogMatches.map((c) => ({
      slug: commanderNameToSlug(c.name),
      name: c.name,
      scryfallId: c.id,
      colorIdentity: c.colorIdentity,
      imageUrl: c.imageNormal,
      fromCatalog: true,
    }));

    const merged = [
      ...matches.map((c) => ({
        slug: c.commanderSlug,
        name: c.commanderName,
        rank: c.rank,
        scryfallId: c.scryfallId,
        colorIdentity: c.colorIdentity,
        themes: c.themes,
      })),
      ...catalogCommanders.filter(
        (c) => !matches.some((m) => m.commanderName === c.name),
      ),
    ].slice(0, 25);

    return jsonOk({ results: merged });
  } catch (err) {
    return handleRouteError(err);
  }
}
