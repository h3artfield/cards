import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";
import { exportInventoryItemToShopify } from "@/lib/shopify/export-inventory-item";
import {
  catalogExportEligibility,
  catalogExportQuantity,
  resolveCatalogExportPrice,
} from "@/lib/shopify/inventory-listing";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import type { CatalogExportResult } from "@/lib/shopify/export-inventory-item";
import type { ShopifyProductStatus } from "@/lib/shopify/types";
import { dataStore } from "@/lib/storage/data-store";
import type { InventoryItem } from "@/lib/types";

/** One Shopify product per request batch — keeps well inside the request budget. */
const MAX_BATCH = 25;

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const [settings, inventory] = await Promise.all([
      dataStore.getSettings(scope.storeId),
      dataStore.getInventory(scope.storeId),
    ]);
    const integration = settings.shopifyIntegration;

    let eligible = 0;
    let listed = 0;
    let blocked = 0;
    const reasons: Record<string, number> = {};
    const preview: Array<{
      inventoryItemId: string;
      displayName: string;
      setName?: string;
      condition?: string;
      quantity: number;
      price: number | null;
    }> = [];

    for (const item of inventory) {
      const el = catalogExportEligibility(item, integration);
      if (el.eligible) {
        eligible += 1;
        if (preview.length < MAX_BATCH) {
          preview.push({
            inventoryItemId: item.id,
            displayName: item.displayName,
            setName: item.setName,
            condition: item.tcgplayerCondition ?? item.condition,
            quantity: catalogExportQuantity(item),
            price: integration
              ? resolveCatalogExportPrice(item, integration)
              : null,
          });
        }
        continue;
      }
      if (el.reason === "already_exported") {
        listed += 1;
        continue;
      }
      if (el.reason === "not_catalog_item") continue;
      blocked += 1;
      reasons[el.reason] = (reasons[el.reason] ?? 0) + 1;
    }

    return jsonOk({
      integrationEnabled: Boolean(integration?.enabled),
      eligible,
      listed,
      blocked,
      reasons,
      preview,
      batchSize: MAX_BATCH,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      inventoryItemIds?: unknown;
      limit?: number;
      productStatus?: ShopifyProductStatus;
      reexport?: boolean;
    };

    const settings = await dataStore.getSettings(scope.storeId);
    const integration = settings.shopifyIntegration;
    if (!integration?.enabled) {
      return jsonError("Shopify integration is not enabled", 400);
    }

    const requestedIds = Array.isArray(body.inventoryItemIds)
      ? body.inventoryItemIds.filter((id): id is string => typeof id === "string")
      : [];

    const inventory = await dataStore.getInventory(scope.storeId);
    let targets: InventoryItem[];

    if (requestedIds.length) {
      if (requestedIds.length > MAX_BATCH) {
        return jsonError(`Export at most ${MAX_BATCH} rows per request`, 400);
      }
      const byId = new Map(inventory.map((i) => [i.id, i]));
      targets = requestedIds
        .map((id) => byId.get(id))
        .filter((i): i is InventoryItem => i != null);
    } else {
      const limit = Math.min(
        Math.max(1, Math.trunc(body.limit ?? MAX_BATCH)),
        MAX_BATCH,
      );
      targets = inventory
        .filter(
          (i) =>
            catalogExportEligibility(i, integration, {
              allowReexport: body.reexport,
            }).eligible,
        )
        .slice(0, limit);
    }

    if (!targets.length) {
      return jsonError("No inventory rows are ready for Shopify", 400);
    }

    const { accessToken, settings: settingsWithToken } =
      await resolveShopifyAccessTokenForStore(scope.storeId, settings);
    const activeIntegration =
      settingsWithToken.shopifyIntegration ?? integration;

    const results: CatalogExportResult[] = [];
    let exported = 0;

    for (const item of targets) {
      const out = await exportInventoryItemToShopify({
        item,
        settings: settingsWithToken,
        integration: activeIntegration,
        accessToken,
        productStatus: body.productStatus,
        exportedBy: auth.email,
        reexport: body.reexport,
      });
      if (out.item) {
        await dataStore.saveInventoryItem(out.item);
        exported += 1;
      }
      results.push(out.result);
    }

    if (exported) {
      invalidateStoreInventoryCache(scope.storeId);
    }

    await dataStore.logAdminAction({
      action: "shopify_export",
      metadata: {
        source: "catalog_inventory",
        count: exported,
        failed: results.filter((r) => !r.ok).length,
      },
    });

    return jsonOk({ results, exported });
  } catch (err) {
    return handleRouteError(err);
  }
}
