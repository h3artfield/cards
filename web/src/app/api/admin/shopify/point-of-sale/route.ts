import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import {
  findPointOfSalePublicationId,
  syncShopifyPointOfSale,
} from "@/lib/shopify/sync-point-of-sale";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

const PREVIEW_LIMIT = 1000;
const APPLY_LIMIT = 120;
const TIME_BUDGET_MS = 240_000;

/**
 * Make existing listings sellable at the register: on the Point of Sale
 * channel, and Active when in stock if the store's default status is Active.
 */
export async function POST(req: NextRequest) {
  try {
    const started = Date.now();
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      apply?: boolean;
      cursor?: number;
    };
    const apply = body.apply === true;
    const cursor = Number.isFinite(body.cursor) ? Number(body.cursor) : 0;

    const settings = await dataStore.getSettings(scope.storeId);
    if (!settings.shopifyIntegration?.enabled) {
      return jsonError("Shopify integration is not enabled", 400);
    }

    const { accessToken, settings: withToken } =
      await resolveShopifyAccessTokenForStore(scope.storeId, settings);
    const integration = withToken.shopifyIntegration ?? settings.shopifyIntegration;
    const domain = integration.shopDomain;
    if (!accessToken || !domain) {
      return jsonError("Shopify credentials not configured", 400);
    }

    const publicationId = await findPointOfSalePublicationId(domain, accessToken);
    if (!publicationId) {
      return jsonError(
        "Shopify has no Point of Sale channel for this app. Add the Point of Sale sales channel in Shopify, and make sure the app can manage publications.",
        400,
      );
    }

    const activateInStock = integration.defaultProductStatus === "ACTIVE";
    const inventory = await dataStore.getInventory(scope.storeId);
    const summary = await syncShopifyPointOfSale({
      items: inventory,
      shopDomain: domain,
      accessToken,
      publicationId,
      activateInStock,
      apply,
      cursor,
      limit: apply ? APPLY_LIMIT : PREVIEW_LIMIT,
      deadlineMs: started + TIME_BUDGET_MS,
      onActivated: (item) => dataStore.saveInventoryItem(item),
    });

    if (apply) {
      await dataStore.logAdminAction({
        action: "shopify_point_of_sale_sync",
        metadata: {
          cursor,
          listed: summary.listed,
          checked: summary.checked,
          updated: summary.updated,
          alreadyCorrect: summary.alreadyCorrect,
          draftKept: summary.draftKept,
          failed: summary.failed,
          nextCursor: summary.nextCursor ?? -1,
        },
      });
    }

    const failures = summary.outcomes.filter((o) => o.error).slice(0, 50);
    return jsonOk({
      apply,
      activateInStock,
      summary: { ...summary, outcomes: failures },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
