import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { computeInventoryAnalytics } from "@/lib/inventory/analytics";
import { snapshotFromAnalytics } from "@/lib/inventory/import-snapshots";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { pushShopifyLevelsAfterImport } from "@/lib/shopify/sync-inventory-levels";
import { dataStore } from "@/lib/storage/data-store";
import { applyTcgplayerInventoryImport } from "@/lib/tcgplayer-inventory/apply-import";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      csv?: string;
      skipConflicts?: boolean;
    };
    if (!body.csv?.trim()) {
      return jsonError("Upload a TCGplayer inventory export CSV", 400);
    }

    const inventory = await dataStore.getInventory(scope.storeId);
    const result = applyTcgplayerInventoryImport({
      csvText: body.csv,
      storeId: scope.storeId,
      existingInventory: inventory,
      skipConflicts: body.skipConflicts ?? true,
    });

    for (const item of result.items) {
      await dataStore.saveInventoryItem(item);
    }

    invalidateStoreInventoryCache(scope.storeId);

    const shopifySync = await pushShopifyLevelsAfterImport(
      scope.storeId,
      result.items,
    );

    const updatedInventory = await dataStore.getInventory(scope.storeId);
    const analytics = computeInventoryAnalytics(
      updatedInventory.filter(
        (i) => isCatalogImportItem(i) && i.status !== "sold",
      ),
    );
    await dataStore.saveInventoryImportSnapshot(
      snapshotFromAnalytics({
        storeId: scope.storeId,
        analytics,
        listedShopifyRows: analytics.listedShopifyRows,
        importStats: {
          created: result.created,
          updated: result.updated,
          withdrawn: result.withdrawn,
        },
      }),
    );

    await dataStore.logAdminAction({
      action: "inventory_tcgplayer_import",
      metadata: {
        created: result.created,
        updated: result.updated,
        withdrawn: result.withdrawn,
        skipped: result.skipped,
        conflicts: result.conflicts,
        shopifyQuantityPushed: shopifySync.quantityPushed,
        shopifyPricePushed: shopifySync.pricePushed,
        shopifySyncFailed: shopifySync.failed,
      },
    });

    return jsonOk({ result, shopifySync });
  } catch (err) {
    return handleRouteError(err);
  }
}
