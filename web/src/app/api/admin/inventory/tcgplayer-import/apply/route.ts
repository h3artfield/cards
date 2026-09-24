import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";
import { computeInventoryAnalytics } from "@/lib/inventory/analytics";
import { backfillInventoryImagesRun } from "@/lib/inventory/image-backfill";
import { snapshotFromAnalytics } from "@/lib/inventory/import-snapshots";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { pushShopifyLevelsAfterImport } from "@/lib/shopify/sync-inventory-levels";
import { dataStore } from "@/lib/storage/data-store";
import { applyTcgplayerInventoryImport } from "@/lib/tcgplayer-inventory/apply-import";
import { TcgplayerImportWithdrawalBlockedError } from "@/lib/tcgplayer-inventory/import-guard";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      csv?: string;
      skipConflicts?: boolean;
      confirmLargeWithdrawal?: boolean;
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
      confirmLargeWithdrawal: body.confirmLargeWithdrawal ?? false,
    });

    for (const item of result.items) {
      await dataStore.saveInventoryItem(item);
    }

    invalidateStoreInventoryCache(scope.storeId);

    const updatedInventory = await dataStore.getInventory(scope.storeId);
    const catalog = updatedInventory.filter(
      (i) => isCatalogImportItem(i) && i.status !== "sold",
    );
    const crosswalks = await deckBuilderStore.listCrosswalks(scope.storeId);
    const crosswalkByItemId = new Map(
      crosswalks.map((cw) => [cw.inventoryItemId, cw]),
    );
    const imageCacheRun = await backfillInventoryImagesRun({
      storeId: scope.storeId,
      items: catalog,
      batchSize: 15,
      budgetMs: 50_000,
      crosswalkByItemId,
    });
    for (const item of imageCacheRun.updatedItems) {
      await dataStore.saveInventoryItem(item);
    }
    invalidateStoreInventoryCache(scope.storeId);

    const shopifySync = await pushShopifyLevelsAfterImport(
      scope.storeId,
      result.items,
    );

    const analytics = computeInventoryAnalytics(
      (await dataStore.getInventory(scope.storeId)).filter(
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
          csvRowCount: result.csvRowCount,
          csvProductLines: result.csvProductLines,
          outOfScopeRows: result.outOfScopeRows,
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
        csvRowCount: result.csvRowCount,
        csvProductLines: result.csvProductLines,
        outOfScopeRows: result.outOfScopeRows,
        shopifyQuantityPushed: shopifySync.quantityPushed,
        shopifyPricePushed: shopifySync.pricePushed,
        shopifySyncFailed: shopifySync.failed,
      },
    });

    return jsonOk({
      result,
      shopifySync,
      imageCache: {
        cached: imageCacheRun.cached,
        failed: imageCacheRun.failed,
        remaining: imageCacheRun.remaining,
        processed: imageCacheRun.processed,
      },
    });
  } catch (err) {
    if (err instanceof TcgplayerImportWithdrawalBlockedError) {
      return jsonError(err.message, 409, { blocked: true, risk: err.risk });
    }
    return handleRouteError(err);
  }
}
