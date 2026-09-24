import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import {
  applyManualCatalogMatch,
  ManualCatalogMatchError,
} from "@/lib/deck-builder/manual-catalog-match";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";
import {
  buildManualInventoryItem,
  ManualAddError,
} from "@/lib/inventory/manual-add";
import { dataStore } from "@/lib/storage/data-store";
import type { CardCategory, ConditionEstimate } from "@/lib/types";

/**
 * Add stock a clerk entered by hand. Linking the Scryfall printing is a second
 * step on purpose: if the catalog lookup fails, the cards are still counted as
 * inventory and can be matched later from the catalog match queue.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      displayName?: string;
      setName?: string;
      cardNumber?: string;
      category?: CardCategory;
      condition?: ConditionEstimate;
      quantity?: number;
      price?: number;
      unitCost?: number;
      scryfallId?: string;
      imageUrl?: string;
    };

    const item = buildManualInventoryItem({
      storeId: scope.storeId,
      displayName: body.displayName ?? "",
      setName: body.setName,
      cardNumber: body.cardNumber,
      category: body.category,
      condition: body.condition ?? "NM",
      quantity: Number(body.quantity ?? 1),
      price: Number(body.price ?? 0),
      unitCost: body.unitCost == null ? undefined : Number(body.unitCost),
      imageUrl: body.imageUrl,
      addedBy: auth.email,
    });

    await dataStore.saveInventoryItem(item);

    let catalogWarning: string | undefined;
    const scryfallId = body.scryfallId?.trim();
    if (scryfallId) {
      try {
        const crosswalks = await deckBuilderStore.listCrosswalks(scope.storeId);
        const crosswalkByItem = new Map(
          crosswalks.map((cw) => [cw.inventoryItemId, cw]),
        );
        await applyManualCatalogMatch({
          storeId: scope.storeId,
          inventoryItemId: item.id,
          scryfallId,
          getInventoryItem: (id) => dataStore.getInventoryItem(id),
          saveInventoryItem: (next) => dataStore.saveInventoryItem(next),
          saveCatalogCard: (card) => deckBuilderStore.saveCatalogCard(card),
          saveCatalogOracleCard: (oracle) =>
            deckBuilderStore.saveCatalogOracleCard(oracle),
          getCatalogOracleCard: (id) =>
            deckBuilderStore.getCatalogOracleCard(id),
          saveCrosswalk: (cw) => deckBuilderStore.saveCrosswalk(cw),
          getExistingCrosswalk: async (_storeId, itemId) =>
            crosswalkByItem.get(itemId) ?? null,
        });
      } catch (err) {
        catalogWarning =
          err instanceof ManualCatalogMatchError
            ? err.message
            : "Saved, but could not link the card to the catalog.";
        console.error("[manual-add] catalog match failed:", err);
      }
    }

    invalidateStoreInventoryCache(scope.storeId);

    await dataStore.logAdminAction({
      action: "inventory_manual_add",
      metadata: {
        inventoryItemId: item.id,
        displayName: item.displayName,
        setName: item.setName ?? null,
        quantity: item.quantity ?? 0,
        price: item.listPrice ?? 0,
        condition: item.condition ?? null,
        linkedScryfallId: scryfallId ?? null,
        catalogLinked: Boolean(scryfallId) && !catalogWarning,
      },
    });

    const saved = (await dataStore.getInventoryItem(item.id)) ?? item;
    return jsonOk({ item: saved, catalogWarning });
  } catch (err) {
    if (err instanceof ManualAddError) {
      return jsonError(err.message, 400, { field: err.field });
    }
    return handleRouteError(err);
  }
}
