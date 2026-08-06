import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { computeInventoryAnalytics } from "@/lib/inventory/analytics";
import { snapshotFromAnalytics } from "@/lib/inventory/import-snapshots";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { applyShopifyInventoryImport } from "@/lib/shopify-inventory/apply-import";
import { fetchShopifyCatalogVariants } from "@/lib/shopify-inventory/fetch-products";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import { formatShopifyApiErrorMessage } from "@/lib/shopify/client";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      skipConflicts?: boolean;
    };

    const settings = await dataStore.getSettings(scope.storeId);
    const integration = settings.shopifyIntegration;
    if (!integration?.enabled || !integration.shopDomain) {
      return jsonError("Enable Shopify in Settings → Integrations first", 400);
    }

    const { accessToken } = await resolveShopifyAccessTokenForStore(
      scope.storeId,
      settings,
    );

    let variants;
    try {
      variants = await fetchShopifyCatalogVariants({
        shopDomain: integration.shopDomain,
        accessToken,
      });
    } catch (err) {
      return jsonError(formatShopifyApiErrorMessage(err), 502);
    }

    const inventory = await dataStore.getInventory(scope.storeId);
    const result = applyShopifyInventoryImport({
      variants,
      storeId: scope.storeId,
      shopDomain: integration.shopDomain,
      existingInventory: inventory,
      skipConflicts: body.skipConflicts ?? true,
    });

    for (const item of result.items) {
      await dataStore.saveInventoryItem(item);
    }

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
      action: "inventory_shopify_import",
      metadata: {
        created: result.created,
        updated: result.updated,
        withdrawn: result.withdrawn,
        skipped: result.skipped,
        conflicts: result.conflicts,
        shopifyVariants: variants.length,
      },
    });

    return jsonOk({ result, shopifyVariants: variants.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
