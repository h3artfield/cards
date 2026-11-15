import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api-utils";
import { ensureSeedData } from "@/lib/storage/ensure-seed";
import { dataStore } from "@/lib/storage/data-store";
import {
  processShopifyInventoryLevelUpdate,
  processShopifyOrderPaid,
  type ShopifyInventoryLevelPayload,
  type ShopifyOrderWebhookPayload,
} from "@/lib/shopify/sold-detection";
import { resolveStoreIdFromShopDomain } from "@/lib/shopify/resolve-store";
import { applyTokenOrderPaidV1 } from "@/lib/token-creator/orders-v1";
import { pushShopifyLevelsAfterImport } from "@/lib/shopify/sync-inventory-levels";
import {
  getShopifyWebhookSecret,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify/webhook-verify";

export const runtime = "nodejs";

/**
 * Push our shelf back onto the Shopify product. Quantity 0 drafts it. A
 * restock above 0 sets it Active again, which is all a draft needs to return
 * to the storefront.
 *
 * Best effort on purpose: the shelf write already happened, and a non-2xx
 * here would make Shopify redeliver the webhook.
 */
async function syncListingState(
  storeId: string,
  inventoryItemIds: string[],
): Promise<void> {
  if (!inventoryItemIds.length) return;
  try {
    const wanted = new Set(inventoryItemIds);
    const inventory = await dataStore.getInventory(storeId);
    const touched = inventory.filter((item) => wanted.has(item.id));
    if (touched.length) await pushShopifyLevelsAfterImport(storeId, touched);
  } catch (err) {
    console.error("[shopify webhook] could not withdraw sold listings:", err);
  }
}

export async function POST(req: NextRequest) {
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const topic = req.headers.get("x-shopify-topic");
  const hmac = req.headers.get("x-shopify-hmac-sha256");

  if (!shopDomain) {
    return jsonError("Missing x-shopify-shop-domain header", 400);
  }

  const body = await req.text();

  try {
    await ensureSeedData();

    const storeId = await resolveStoreIdFromShopDomain(shopDomain);
    if (!storeId) {
      console.warn("[shopify webhook] unknown shop domain:", shopDomain);
      return jsonOk({ received: true, matched: false });
    }

    const settings = await dataStore.getSettings(storeId);
    const integration = settings.shopifyIntegration;
    const secret = getShopifyWebhookSecret(integration);
    if (!secret) {
      return jsonError("Shopify webhook secret not configured", 503);
    }

    if (!verifyShopifyWebhookHmac(body, hmac, secret)) {
      return jsonError("Invalid Shopify webhook signature", 401);
    }

    const payload = JSON.parse(body) as
      | ShopifyOrderWebhookPayload
      | ShopifyInventoryLevelPayload;

    if (topic === "inventory_levels/update") {
      const result = await processShopifyInventoryLevelUpdate({
        storeId,
        payload: payload as ShopifyInventoryLevelPayload,
        defaultLocationId: integration?.defaultLocationId,
      });
      if (result?.restocked) {
        await syncListingState(storeId, [result.inventoryItemId]);
      }
      return jsonOk({
        received: true,
        topic,
        processed: result && !result.alreadySold ? 1 : 0,
        alreadySold: result?.alreadySold ? 1 : 0,
        result,
      });
    }

    if (topic === "orders/paid" || topic === "orders/create") {
      const orderPayload = payload as ShopifyOrderWebhookPayload;
      if (topic === "orders/create" && orderPayload.financial_status !== "paid") {
        return jsonOk({ received: true, skipped: "awaiting_payment" });
      }

      const results = await processShopifyOrderPaid({
        storeId,
        order: orderPayload,
      });

      // Token print orders are released to the staff queue only from here or
      // from the admin sync, never before Shopify reports the order paid.
      let tokenOrders: string[] = [];
      try {
        tokenOrders = await applyTokenOrderPaidV1({
          storeId,
          order: orderPayload as Parameters<typeof applyTokenOrderPaidV1>[0]["order"],
        });
      } catch (err) {
        console.error("[shopify webhook] token order update failed:", err);
        return jsonError("Token order update failed", 500);
      }

      await syncListingState(
        storeId,
        results.filter((r) => !r.alreadySold).map((r) => r.inventoryItemId),
      );

      return jsonOk({
        received: true,
        topic,
        processed: results.filter((r) => !r.alreadySold).length,
        alreadySold: results.filter((r) => r.alreadySold).length,
        results,
        tokenOrders,
      });
    }

    return jsonOk({ received: true, ignored: topic ?? "unknown" });
  } catch (err) {
    console.error("[shopify webhook]", err);
    return jsonError("Webhook handler failed", 500);
  }
}
