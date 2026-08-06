import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import {
  persistResolvedInventoryImage,
} from "@/lib/inventory/persist-inventory-image";
import { resolveInventoryImageBuffer } from "@/lib/inventory/resolve-display-image";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const itemId = req.nextUrl.searchParams.get("itemId")?.trim();
    if (!itemId) return jsonError("itemId is required", 400);

    const item = await dataStore.getInventoryItem(itemId);
    if (!item || item.storeId !== store.id) {
      return jsonError("Item not found", 404);
    }

    const scryfallId =
      item.catalogScryfallId ??
      (await deckBuilderStore.listCrosswalks(store.id)).find(
        (c) => c.inventoryItemId === itemId,
      )?.scryfallId;
    const catalog = scryfallId
      ? await deckBuilderStore.getCatalogCard(scryfallId)
      : null;

    const resolved = await resolveInventoryImageBuffer(item, catalog);

    void persistResolvedInventoryImage({
      item,
      buffer: resolved.buffer,
      contentType: resolved.contentType,
      source: resolved.source,
      tcgLowPrice: resolved.tcgLowPrice,
    }).catch(() => undefined);

    return new NextResponse(new Uint8Array(resolved.buffer), {
      status: 200,
      headers: {
        "Content-Type": resolved.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image unavailable";
    if (/timeout|abort|unavailable/i.test(message)) {
      return new NextResponse(null, { status: 404 });
    }
    return handleRouteError(err);
  }
}
