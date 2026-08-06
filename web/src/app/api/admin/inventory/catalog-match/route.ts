import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import {
  applyManualCatalogMatch,
  ManualCatalogMatchError,
} from "@/lib/deck-builder/manual-catalog-match";
import { dataStore } from "@/lib/storage/data-store";

/** Apply an admin manual Scryfall printing link to an inventory row. */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      inventoryItemId?: string;
      scryfallId?: string;
    };

    const inventoryItemId = body.inventoryItemId?.trim();
    const scryfallId = body.scryfallId?.trim();
    if (!inventoryItemId || !scryfallId) {
      return jsonError("inventoryItemId and scryfallId are required");
    }

    const crosswalks = await deckBuilderStore.listCrosswalks(scope.storeId);
    const crosswalkByItem = new Map(
      crosswalks.map((cw) => [cw.inventoryItemId, cw]),
    );

    const result = await applyManualCatalogMatch({
      storeId: scope.storeId,
      inventoryItemId,
      scryfallId,
      getInventoryItem: (id) => dataStore.getInventoryItem(id),
      saveInventoryItem: (item) => dataStore.saveInventoryItem(item),
      saveCatalogCard: (card) => deckBuilderStore.saveCatalogCard(card),
      saveCatalogOracleCard: (oracle) =>
        deckBuilderStore.saveCatalogOracleCard(oracle),
      getCatalogOracleCard: (id) => deckBuilderStore.getCatalogOracleCard(id),
      saveCrosswalk: (cw) => deckBuilderStore.saveCrosswalk(cw),
      getExistingCrosswalk: async (_storeId, itemId) =>
        crosswalkByItem.get(itemId) ?? null,
    });

    return jsonOk({
      inventoryItemId: result.item.id,
      displayName: result.item.displayName,
      catalogScryfallId: result.item.catalogScryfallId,
      catalogOracleId: result.item.catalogOracleId,
      catalogMatchMethod: result.item.catalogMatchMethod,
      previousScryfallId: result.previousScryfallId,
      catalogName: result.catalog.name,
      setName: result.catalog.setName,
      collectorNumber: result.catalog.collectorNumber,
    });
  } catch (err) {
    if (err instanceof ManualCatalogMatchError) {
      const status =
        err.code === "inventory_not_found" || err.code === "wrong_store"
          ? 404
          : 400;
      return jsonError(err.message, status);
    }
    return handleRouteError(err);
  }
}
