import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { touchCatalogSyncState } from "@/lib/deck-builder/catalog-sync-state";
import { enrichInventoryCatalogBatch } from "@/lib/deck-builder/inventory-catalog-enrichment";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "@/lib/inventory/status";
import {
  isInventoryCatalogEnriched,
  isMagicInventoryItem,
} from "@/lib/inventory/magic-items";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

/** Link inventory → Scryfall via TCGplayer ID and write golden-table fields on each row. */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      forceRelink?: boolean;
      magicOnly?: boolean;
    };
    const limit = Math.min(500, Math.max(1, body.limit ?? 200));
    const forceRelink = body.forceRelink === true;

    const items = (await dataStore.getInventory(scope.storeId)).filter(
      (i) =>
        isCatalogImportItem(i) &&
        isInventoryAvailable(i) &&
        inventoryEffectiveQuantity(i) > 0,
    );

    const existing = await deckBuilderStore.listCrosswalks(scope.storeId);
    const map = new Map(existing.map((c) => [c.inventoryItemId, c]));

    const result = await enrichInventoryCatalogBatch({
      storeId: scope.storeId,
      items,
      existingCrosswalks: map,
      limit,
      forceRelink,
      magicOnly: body.magicOnly !== false,
      saveCrosswalk: (cw) => deckBuilderStore.saveCrosswalk(cw),
      saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
      saveCatalogOracleCard: (o) => deckBuilderStore.saveCatalogOracleCard(o),
      getCatalogOracleCard: (id) => deckBuilderStore.getCatalogOracleCard(id),
      saveInventoryItem: (item) => dataStore.saveInventoryItem(item),
    });

    const pending = items.filter(
      (i) => isMagicInventoryItem(i) && !isInventoryCatalogEnriched(i),
    ).length;

    await touchCatalogSyncState({
      lastInventoryEnrichAt: new Date().toISOString(),
      catalogPrintingCount: await deckBuilderStore.countCatalogCards(),
      catalogOracleCardCount: await deckBuilderStore.countCatalogOracleCards(),
      scryfallBulkVersion: result.bulkIndexUsed ? "bulk-index" : "api-fallback",
    });

    return jsonOk({
      ...result,
      pendingEstimate: Math.max(0, pending - result.enriched),
      totalMagic: items.filter((i) => isMagicInventoryItem(i)).length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
