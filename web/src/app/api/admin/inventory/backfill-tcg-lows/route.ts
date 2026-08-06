import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { backfillInventoryTcgLowPricesBatch } from "@/lib/inventory/tcg-low-price";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(20, Math.max(1, body.limit ?? 10));

    const all = await dataStore.getInventory(scope.storeId);
    const catalog = all.filter(
      (i) => isCatalogImportItem(i) && i.status !== "sold",
    );
    const batch = await backfillInventoryTcgLowPricesBatch({
      items: catalog,
      limit,
    });

    for (const item of batch.updatedItems) {
      await dataStore.saveInventoryItem(item);
    }

    return jsonOk({ batch });
  } catch (err) {
    return handleRouteError(err);
  }
}
