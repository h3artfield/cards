import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import { syncShopifyBarcodes } from "@/lib/shopify/sync-barcodes";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

/** Previews only read, so they can cover far more listings per request. */
const PREVIEW_LIMIT = 1000;
const APPLY_LIMIT = 150;
const TIME_BUDGET_MS = 240_000;

/**
 * Re-point Shopify variant barcodes at the current card link URL. Listings
 * made before the store's public domain existed carry the old URL, so the
 * register cannot match a scanned QR label to them.
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
    if (!settings.storeSlug) {
      return jsonError("Store has no public slug", 400);
    }

    const { accessToken, settings: withToken } =
      await resolveShopifyAccessTokenForStore(scope.storeId, settings);
    const domain =
      withToken.shopifyIntegration?.shopDomain ??
      settings.shopifyIntegration.shopDomain;
    if (!accessToken || !domain) {
      return jsonError("Shopify credentials not configured", 400);
    }

    const inventory = await dataStore.getInventory(scope.storeId);
    const summary = await syncShopifyBarcodes({
      items: inventory,
      shopDomain: domain,
      accessToken,
      storeSlug: settings.storeSlug,
      apply,
      cursor,
      limit: apply ? APPLY_LIMIT : PREVIEW_LIMIT,
      deadlineMs: started + TIME_BUDGET_MS,
    });

    if (apply) {
      await dataStore.logAdminAction({
        action: "shopify_barcode_sync",
        metadata: {
          cursor,
          listed: summary.listed,
          checked: summary.checked,
          updated: summary.updated,
          alreadyCorrect: summary.alreadyCorrect,
          noCardLink: summary.noCardLink,
          failed: summary.failed,
          nextCursor: summary.nextCursor ?? -1,
        },
      });
    }

    const failures = summary.outcomes.filter((o) => o.error).slice(0, 50);
    const samples = summary.outcomes.filter((o) => !o.error).slice(0, 3);
    return jsonOk({ apply, summary: { ...summary, outcomes: [...failures, ...samples] } });
  } catch (err) {
    return handleRouteError(err);
  }
}
