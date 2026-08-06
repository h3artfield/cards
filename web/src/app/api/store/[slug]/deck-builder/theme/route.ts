import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getOrSyncEdhrecMeta,
  resolveStoreBySlug,
} from "@/lib/deck-builder/deck-builder-service";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const body = (await req.json()) as {
      commanderSlug?: string;
      themeSlug?: string;
    };

    if (!body.commanderSlug || !body.themeSlug) {
      return jsonError("commanderSlug and themeSlug are required", 400);
    }

    const meta = await getOrSyncEdhrecMeta({
      commanderSlug: body.commanderSlug,
      themeSlug: body.themeSlug,
    });

    if (!meta) {
      return jsonError("Could not load theme data", 404);
    }

    let commanderImage: string | undefined;
    if (meta.scryfallId) {
      const card = await deckBuilderStore.getCatalogCard(meta.scryfallId);
      commanderImage = card?.imageNormal;
    }

    return jsonOk({
      meta: {
        slug: meta.commanderSlug,
        themeSlug: meta.themeSlug,
        name: meta.commanderName,
        themes: meta.themes,
        colorIdentity: meta.colorIdentity,
        scryfallId: meta.scryfallId,
        imageUrl: commanderImage,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
