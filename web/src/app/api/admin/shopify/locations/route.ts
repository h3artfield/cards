import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import { testShopifyConnection } from "@/lib/shopify/client";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const settings = await dataStore.getSettings(scope.storeId);
    const integration = settings.shopifyIntegration;
    const domain = integration?.shopDomain;

    if (!integration?.enabled || !domain) {
      return jsonError("Shopify integration is not configured", 400);
    }

    const { accessToken } = await resolveShopifyAccessTokenForStore(
      scope.storeId,
      settings,
    );

    const result = await testShopifyConnection(domain, accessToken);
    return jsonOk({ locations: result.locations });
  } catch (err) {
    return handleRouteError(err);
  }
}
