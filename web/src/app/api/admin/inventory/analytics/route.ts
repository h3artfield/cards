import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { computeInventoryAnalytics } from "@/lib/inventory/analytics";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const all = await dataStore.getInventory(scope.storeId);
    const catalogItems = all.filter(
      (i) => isCatalogImportItem(i) && i.status !== "sold",
    );
    const analytics = computeInventoryAnalytics(catalogItems);
    const importTrends = await dataStore.listInventoryImportSnapshots(
      scope.storeId,
      20,
    );

    return jsonOk({ analytics, importTrends });
  } catch (err) {
    return handleRouteError(err);
  }
}
