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
import { pushShopifyLevelsAfterImport } from "@/lib/shopify/sync-inventory-levels";
import {
  getShopifyWebhookSecret,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify/webhook-verify";

export const runtime = "nodejs";

/**
 * Shopify zeroes its own count when an order is paid, but the product stays
 * visible as sold out. Push our state back so a card that is gone leaves the
 * storefront right away instead of waiting for the next CSV import.
 *
 * Best effort on purpose: the sale is already recorded, and a non-2xx here
 * would make Shopify redeliver the whole order.
 */
async function withdrawSoldOutListings(
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
      });
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

      await withdrawSoldOutListings(
        storeId,
        results.filter((r) => !r.alreadySold).map((r) => r.inventoryItemId),
      );

      return jsonOk({
        received: true,
        topic,
        processed: results.filter((r) => !r.alreadySold).length,
        alreadySold: results.filter((r) => r.alreadySold).length,
        results,
      });
    }

    return jsonOk({ received: true, ignored: topic ?? "unknown" });
  } catch (err) {
    console.error("[shopify webhook]", err);
    return jsonError("Webhook handler failed", 500);
  }
}
