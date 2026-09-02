import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import {
  browseInventoryItems,
  type InventoryListedFilter,
  type InventoryStockFilter,
} from "@/lib/inventory/search";
import {
  inventoryItemCanRetryImageCache,
  inventoryItemNeedsImageCache,
} from "@/lib/inventory/image-backfill";
import { inventoryItemNeedsTcgLowPrice } from "@/lib/inventory/tcg-low-price";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const params = req.nextUrl.searchParams;
    const q = params.get("q") ?? undefined;
    const stock = (params.get("stock") ?? "all") as InventoryStockFilter;
    const listed = (params.get("listed") ?? "all") as InventoryListedFilter;
    const page = Number(params.get("page") ?? "1");
    const limit = Number(params.get("limit") ?? "48");

    // The register sells buyback singles too; the catalog browser does not.
    const includeAllSources = params.get("source") === "all";
    const all = await dataStore.getInventory(scope.storeId);
    const active = all.filter(
      (item) =>
        item.status !== "sold" &&
        (includeAllSources || isCatalogImportItem(item)),
    );
    const result = browseInventoryItems(active, { q, stock, listed, page, limit });

    return jsonOk({
      ...result,
      imagesPending: active.filter(inventoryItemNeedsImageCache).length,
      imagesRetryable: active.filter(inventoryItemCanRetryImageCache).length,
      tcgLowsPending: active.filter(inventoryItemNeedsTcgLowPrice).length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
