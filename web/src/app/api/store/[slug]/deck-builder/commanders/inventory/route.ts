import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  listInventoryCommanders,
  parseBrowseColorParams,
  type StoreInventoryColorFilter,
} from "@/lib/deck-builder/store-inventory-browse";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { commanderNameToSlug } from "@/lib/deck-builder/edhrec-client";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const sp = req.nextUrl.searchParams;
    const color = (sp.get("color") ?? "all") as StoreInventoryColorFilter;
    const colors = sp.get("colors") ?? undefined;
    const colorCountRaw = sp.get("colorCount");
    const parsedColors = parseBrowseColorParams({
      colors,
      color,
      colorCount:
        colorCountRaw === "multicolor" ||
        colorCountRaw === "two" ||
        colorCountRaw === "three" ||
        colorCountRaw === "four" ||
        colorCountRaw === "five"
          ? colorCountRaw
          : undefined,
    });
    const q = sp.get("q") ?? undefined;

    const commanders = await listInventoryCommanders({
      storeId: store.id,
      storeSlug: slug,
      selectedColors: parsedColors.selectedColors,
      colorCount: parsedColors.colorCount,
      q,
      limit: 200,
    });

    const withMeta = await Promise.all(
      commanders.map(async (c) => {
        const slugGuess = commanderNameToSlug(c.name);
        const meta = await deckBuilderStore.getEdhrecMeta(slugGuess);
        return {
          ...c,
          slug: slugGuess,
          rank: meta?.rank,
          numDecks: meta?.numDecks,
          themes: meta?.themes ?? [],
          edhrecSynced: Boolean(meta),
        };
      }),
    );

    return jsonOk({ commanders: withMeta });
  } catch (err) {
    return handleRouteError(err);
  }
}
