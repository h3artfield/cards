import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  browseStoreInventory,
  parseBrowseColorParams,
  type StoreInventoryColorFilter,
  type StoreInventoryGameFilter,
  type StoreInventorySortBy,
  type StoreInventoryTypeFilter,
} from "@/lib/deck-builder/store-inventory-browse";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";

export const maxDuration = 120;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") ?? undefined;
    const game = (sp.get("game") ?? "all") as StoreInventoryGameFilter;
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
    const cardType = (sp.get("type") ?? "all") as StoreInventoryTypeFilter;
    const page = parseInt(sp.get("page") ?? "1", 10);
    const limit = parseInt(sp.get("limit") ?? "48", 10);
    const sortRaw = sp.get("sort") ?? "name";
    const sortBy: StoreInventorySortBy =
      sortRaw === "price_asc" || sortRaw === "price_desc" ? sortRaw : "name";

    const result = await browseStoreInventory({
      storeId: store.id,
      storeSlug: slug,
      q,
      game,
      selectedColors: parsedColors.selectedColors,
      colorCount: parsedColors.colorCount,
      cardType,
      page,
      limit,
      sortBy,
    });

    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
