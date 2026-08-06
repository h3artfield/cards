import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { buildShopifyImportPreview } from "@/lib/shopify-inventory/apply-import";
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
    const preview = buildShopifyImportPreview({
      variants,
      existingInventory: inventory,
      shopDomain: integration.shopDomain,
    });

    return jsonOk({ preview });
  } catch (err) {
    return handleRouteError(err);
  }
}
