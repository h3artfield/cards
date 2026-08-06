import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { suggestStoreInventory } from "@/lib/deck-builder/store-inventory-suggest";
import type { StoreInventoryGameFilter } from "@/lib/deck-builder/store-inventory-browse";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return jsonOk({ suggestions: [] });
    }

    const game = (req.nextUrl.searchParams.get("game") ??
      "all") as StoreInventoryGameFilter;
    const limit = Math.min(
      12,
      Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10)),
    );

    const result = await suggestStoreInventory({
      storeId: store.id,
      storeSlug: slug,
      q,
      game,
      limit,
    });

    const suggestions = result.suggestions.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      name: item.name,
      setName: item.setName,
      listPrice: item.listPrice,
      qty: item.qty,
      imageUrl: item.imageUrl ?? item.imageProxyUrl,
      isCommander: item.isCommander,
    }));

    return jsonOk({ suggestions, total: result.total });
  } catch (err) {
    return handleRouteError(err);
  }
}
