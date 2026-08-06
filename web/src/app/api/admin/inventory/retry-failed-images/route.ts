import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { inventoryItemCanRetryImageCache } from "@/lib/inventory/image-backfill";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const all = await dataStore.getInventory(scope.storeId);
    const retryable = all.filter(
      (i) => isCatalogImportItem(i) && inventoryItemCanRetryImageCache(i),
    );
    const cleared = await dataStore.clearInventoryImageCacheFailures(
      retryable.map((item) => item.id),
    );

    return jsonOk({ cleared });
  } catch (err) {
    return handleRouteError(err);
  }
}
