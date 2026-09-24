import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import {
  markInventoryImageUnavailable,
  persistResolvedInventoryImage,
} from "@/lib/inventory/persist-inventory-image";
import { isEnrichableMagicSingle } from "@/lib/inventory/magic-items";
import { resolveInventoryImageBuffer } from "@/lib/inventory/resolve-display-image";
import type { ResolvedInventoryImage } from "@/lib/inventory/resolve-display-image";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 60;

/** Total time spent resolving one image before we give up and answer 404. */
const IMAGE_RESOLVE_BUDGET_MS = 20_000;

function imageUnavailable(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    // Stops Shopify's media fetcher and browsers from re-requesting missing art.
    headers: { "Cache-Control": "public, max-age=60" },
  });
}

async function withBudget<T>(work: Promise<T>, budgetMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Image resolution timeout")),
          budgetMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

    const usesScryfall = isEnrichableMagicSingle(item);
    const scryfallId = usesScryfall
      ? item.catalogScryfallId ??
        (await deckBuilderStore.listCrosswalks(store.id)).find(
          (c) => c.inventoryItemId === itemId,
        )?.scryfallId
      : item.catalogScryfallId;
    const catalog =
      usesScryfall && scryfallId
        ? await deckBuilderStore.getCatalogCard(scryfallId)
        : null;

    const itemForResolve =
      usesScryfall && scryfallId && !item.catalogScryfallId
        ? { ...item, catalogScryfallId: scryfallId }
        : item;

    // A recent failure plus a source we cannot fetch server-side means every
    // option has already been tried and lost. A successful resolve rewrites the
    // row to a Storage URL, so only persistent failures land here.
    let resolved: ResolvedInventoryImage;
    try {
      resolved = await withBudget(
        resolveInventoryImageBuffer(itemForResolve, catalog),
        IMAGE_RESOLVE_BUDGET_MS,
      );
    } catch {
      void markInventoryImageUnavailable(item).catch(() => undefined);
      return imageUnavailable();
    }

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
