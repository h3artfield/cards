import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { exportCardToShopify } from "@/lib/shopify/export-card";
import { shopifyInventoryExportEligibility } from "@/lib/shopify/eligibility";
import { isInventorySold } from "@/lib/shopify/inventory-status";
import { resolveShopifyAccessTokenForStore } from "@/lib/shopify/resolve-access-token";
import type { ShopifyExportCardInput } from "@/lib/shopify/types";
import type { InventoryItem } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      orderId?: string;
      items: ShopifyExportCardInput[];
      productStatus?: "DRAFT" | "ACTIVE";
    };

    if (!body.items?.length) {
      return jsonError("Select at least one card to export", 400);
    }

    const [settings, rules, inventory] = await Promise.all([
      dataStore.getSettings(scope.storeId),
      dataStore.getActiveRules(scope.storeId),
      dataStore.getInventory(scope.storeId),
    ]);

    const integration = settings.shopifyIntegration;
    if (!integration?.enabled) {
      return jsonError("Shopify integration is not enabled", 400);
    }

    const { accessToken, settings: settingsWithToken } =
      await resolveShopifyAccessTokenForStore(scope.storeId, settings);
    const activeIntegration = settingsWithToken.shopifyIntegration ?? integration;

    const onHandByCardId = new Map(
      inventory.filter((i) => !isInventorySold(i)).map((i) => [i.cardId, i]),
    );
    const cardIds = body.items.map((i) => i.cardId);

    for (const cardId of cardIds) {
      if (!onHandByCardId.has(cardId)) {
        return jsonError(
          `Card ${cardId} is not in store inventory — complete purchase first`,
          400,
        );
      }
    }

    const cards = (
      await Promise.all(cardIds.map((id) => dataStore.getCard(id)))
    ).filter((c): c is NonNullable<typeof c> => c != null);

    if (cards.length !== cardIds.length) {
      return jsonError("One or more cards could not be loaded", 404);
    }

    const inputByCardId = new Map(body.items.map((i) => [i.cardId, i]));

    for (const card of cards) {
      const item = onHandByCardId.get(card.id)!;
      const inputItem = inputByCardId.get(card.id);
      const el = shopifyInventoryExportEligibility(card, item, activeIntegration, {
        allowReexport: inputItem?.reexport,
      });
      if (!el.eligible) {
        return jsonError(`${card.detectedName ?? card.id}: ${el.message}`, 400);
      }
    }

    const orderIds = [...new Set(cards.map((c) => c.orderId))];
    const orders = await Promise.all(orderIds.map((id) => dataStore.getOrder(id)));
    const orderById = new Map(
      orders.filter(Boolean).map((o) => [o!.id, o!]),
    );

    const results = [];
    const updatedCards = [];
    const updatedInventory: InventoryItem[] = [];

    for (const inputItem of body.items) {
      const card = cards.find((c) => c.id === inputItem.cardId);
      if (!card) continue;
      const order = orderById.get(card.orderId);
      if (!order) {
        results.push({
          cardId: inputItem.cardId,
          ok: false,
          status: "skipped" as const,
          error: "Order not found",
        });
        continue;
      }

      const cardIndex = cards.findIndex((c) => c.id === card.id);
      const item = onHandByCardId.get(card.id)!;
      const out = await exportCardToShopify({
        card,
        order,
        settings: settingsWithToken,
        integration: activeIntegration,
        accessToken,
        storeRules: rules,
        exportPrice: inputItem.exportPrice,
        productStatus: inputItem.productStatus ?? body.productStatus,
        cardIndex: cardIndex >= 0 ? cardIndex : 0,
        exportedBy: auth.email,
        inventoryOnly: true,
        inventoryItem: item,
        reexport: inputItem.reexport,
      });
      updatedCards.push(out.card);
      if (out.inventoryItem) {
        updatedInventory.push(out.inventoryItem);
      }
      results.push(out.result);
    }

    for (const card of updatedCards) {
      await dataStore.saveCard(card);
    }

    for (const item of updatedInventory) {
      await dataStore.saveInventoryItem(item);
    }

    await dataStore.logAdminAction({
      action: "shopify_export",
      metadata: {
        source: "inventory",
        count: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });

    return jsonOk({ results, cards: updatedCards });
  } catch (err) {
    return handleRouteError(err);
  }
}
