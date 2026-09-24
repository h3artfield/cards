import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";
import { hasShopifyListing } from "@/lib/shopify/inventory-listing";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import { syncShopifyListingsForItems } from "@/lib/shopify/sync-inventory-levels";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

/**
 * Rows we are willing to correct in one request. Listings already in sync are
 * free, so this only bounds genuine drift and keeps us inside the request
 * timeout. The response reports stoppedEarly so the caller can run it again.
 */
const MAX_PUSHES_PER_RUN = 150;

/**
 * Force Shopify to match our inventory. The CSV import already pushes the rows
 * it touched, so this exists for drift the import can never see: failed pushes,
 * missed webhooks, and edits made directly in the Shopify admin.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const settings = await dataStore.getSettings(scope.storeId);
    if (!settings.shopifyIntegration?.enabled) {
      return jsonError("Shopify integration is not enabled", 400);
    }

    const inventory = await dataStore.getInventory(scope.storeId);
    const listed = inventory.filter(hasShopifyListing);
    if (!listed.length) {
      return jsonError("Nothing is listed on Shopify yet", 400);
    }

    const { accessToken, settings: withToken } =
      await resolveShopifyAccessTokenForStore(scope.storeId, settings);

    const summary = await syncShopifyListingsForItems({
      items: listed,
      integration:
        withToken.shopifyIntegration ?? settings.shopifyIntegration,
      accessToken,
      limitPushes: MAX_PUSHES_PER_RUN,
    });

    if (summary.quantityPushed || summary.pricePushed || summary.drafted) {
      invalidateStoreInventoryCache(scope.storeId);
    }

    await dataStore.logAdminAction({
      action: "shopify_reconcile",
      metadata: {
        listed: listed.length,
        considered: summary.considered,
        quantityPushed: summary.quantityPushed,
        pricePushed: summary.pricePushed,
        drafted: summary.drafted,
        reactivated: summary.reactivated,
        unchanged: summary.unchanged,
        failed: summary.failed,
        stoppedEarly: summary.stoppedEarly ?? false,
      },
    });

    return jsonOk({ listed: listed.length, summary });
  } catch (err) {
    return handleRouteError(err);
  }
}
