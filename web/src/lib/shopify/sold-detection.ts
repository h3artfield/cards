import type { InventoryItem, ScannedCard } from "../types";
import { dataStore } from "../storage/data-store";
import { parseShopifySku } from "./product-builder";
import { isInventorySold } from "./inventory-status";
import type { ShopifyCardExport } from "./types";

export type ShopifyOrderLineItem = {
  id: number | string;
  sku?: string | null;
  variant_id?: number | string | null;
  price?: string | number | null;
  quantity?: number | null;
};

export type ShopifyOrderWebhookPayload = {
  id: number | string;
  name?: string;
  line_items?: ShopifyOrderLineItem[];
  financial_status?: string;
  cancelled_at?: string | null;
};

export type SoldDetectionResult = {
  inventoryItemId: string;
  cardId: string;
  soldPrice: number;
  alreadySold: boolean;
};

function normalizeShopifyId(value: number | string | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

async function loadCardForItem(
  item: InventoryItem,
  cardsById: Map<string, ScannedCard>,
): Promise<ScannedCard | null> {
  if (!item.cardId) return null;
  const cached = cardsById.get(item.cardId);
  if (cached) return cached;
  return (await dataStore.getCard(item.cardId)) ?? null;
}

function parseSoldPrice(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function cardIdPrefix(cardId: string): string {
  return cardId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function variantIdMatches(
  listingVariantId: string | undefined,
  lineVariantId: string,
): boolean {
  if (!listingVariantId || !lineVariantId) return false;
  const a = listingVariantId.replace(/\D/g, "");
  const b = lineVariantId.replace(/\D/g, "");
  return a === b && a.length > 0;
}

export function normalizeShopifyResourceId(
  value: number | string | null | undefined,
): string {
  if (value == null) return "";
  const s = String(value);
  const gidMatch = s.match(/\/(\d+)\s*$/);
  if (gidMatch) return gidMatch[1]!;
  const digits = s.replace(/\D/g, "");
  return digits || s;
}

export type ShopifyInventoryLevelPayload = {
  inventory_item_id: number | string;
  location_id?: number | string;
  available?: number | null;
  updated_at?: string;
};

async function findInventoryByShopifyInventoryItemId(
  storeId: string,
  shopifyInventoryItemId: string,
  cardsById: Map<string, ScannedCard>,
): Promise<{ item: InventoryItem; card: ScannedCard | null } | null> {
  const targetId = normalizeShopifyResourceId(shopifyInventoryItemId);
  if (!targetId) return null;

  const inventory = await dataStore.getInventory(storeId);

  for (const item of inventory) {
    const listingId = normalizeShopifyResourceId(
      item.shopifyListing?.inventoryItemId,
    );
    if (listingId && listingId === targetId) {
      const card = await loadCardForItem(item, cardsById);
      return { item, card: card ?? null };
    }
  }

  for (const item of inventory) {
    const card = await loadCardForItem(item, cardsById);
    const exportId = normalizeShopifyResourceId(card?.shopifyExport?.inventoryItemId);
    if (exportId && exportId === targetId) {
      return { item, card: card ?? null };
    }
  }

  return null;
}

async function markInventorySoldFromShopify(input: {
  storeId: string;
  item: InventoryItem;
  card: ScannedCard | null;
  soldPrice: number;
  soldOrderId?: string;
  soldLineItemId?: string;
  detectionSource: "orders_paid" | "inventory_levels_update";
}): Promise<SoldDetectionResult> {
  const { item, card } = input;
  const alreadySold = isInventorySold(item);

  if (alreadySold) {
    return {
      inventoryItemId: item.id,
      cardId: item.cardId ?? "",
      soldPrice: item.soldPrice ?? input.soldPrice,
      alreadySold: true,
    };
  }

  const now = new Date().toISOString();
  const updatedItem: InventoryItem = {
    ...item,
    status: "sold",
    soldAt: now,
    soldChannel: "shopify",
    soldPrice: input.soldPrice,
    soldOrderId: input.soldOrderId,
    soldLineItemId: input.soldLineItemId,
  };
  await dataStore.saveInventoryItem(updatedItem);

  if (card) {
    const shopifyExport: ShopifyCardExport = {
      ...(card.shopifyExport ?? { status: "exported" }),
      status: card.shopifyExport?.status ?? "exported",
      soldAt: now,
      soldOrderId: input.soldOrderId,
    };
    await dataStore.saveCard({ ...card, shopifyExport });
  }

  await dataStore.logAdminAction({
    action: "inventory_sold_shopify",
    metadata: {
      inventoryItemId: item.id,
      cardId: item.cardId ?? "",
      orderId: input.soldOrderId,
      lineItemId: input.soldLineItemId,
      soldPrice: input.soldPrice,
      displayName: item.displayName,
      detectionSource: input.detectionSource,
    },
  });

  return {
    inventoryItemId: item.id,
    cardId: item.cardId ?? "",
    soldPrice: input.soldPrice,
    alreadySold: false,
  };
}

export async function processShopifyInventoryLevelUpdate(input: {
  storeId: string;
  payload: ShopifyInventoryLevelPayload;
}): Promise<SoldDetectionResult | null> {
  const available = input.payload.available;
  if (available == null || available > 0) {
    return null;
  }

  const cardsById = new Map<string, ScannedCard>();
  const match = await findInventoryByShopifyInventoryItemId(
    input.storeId,
    String(input.payload.inventory_item_id),
    cardsById,
  );
  if (!match) return null;

  const { item, card } = match;
  const soldPrice =
    item.shopifyListing?.exportPrice ??
    card?.shopifyExport?.exportPrice ??
    item.marketPrice ??
    0;

  const inventoryItemId = normalizeShopifyResourceId(
    input.payload.inventory_item_id,
  );

  return markInventorySoldFromShopify({
    storeId: input.storeId,
    item,
    card,
    soldPrice,
    soldOrderId: `inventory_level:${inventoryItemId}`,
    detectionSource: "inventory_levels_update",
  });
}

async function findInventoryForLineItem(
  storeId: string,
  lineItem: ShopifyOrderLineItem,
  cardsById: Map<string, ScannedCard>,
): Promise<{ item: InventoryItem; card: ScannedCard | null } | null> {
  const variantId = normalizeShopifyId(lineItem.variant_id);
  const sku = lineItem.sku?.trim() ?? "";

  const inventory = await dataStore.getInventory(storeId);

  if (variantId) {
    for (const item of inventory) {
      if (variantIdMatches(item.shopifyListing?.variantId, variantId)) {
        const card = await loadCardForItem(item, cardsById);
        return { item, card: card ?? null };
      }
    }

    for (const item of inventory) {
      const card = await loadCardForItem(item, cardsById);
      if (card && variantIdMatches(card.shopifyExport?.variantId, variantId)) {
        return { item, card };
      }
    }
  }

  if (sku) {
    const parsed = parseShopifySku(sku);
    if (parsed?.kind === "inventory") {
      const item = inventory.find((i) => i.id === parsed.inventoryItemId);
      if (item) {
        const card = await loadCardForItem(item, cardsById);
        return { item, card: card ?? null };
      }
      const direct = await dataStore.getInventoryItem(parsed.inventoryItemId);
      if (direct && direct.storeId === storeId) {
        const card = await loadCardForItem(direct, cardsById);
        return { item: direct, card: card ?? null };
      }
    }

    if (parsed?.kind === "legacy") {
      for (const item of inventory) {
        if (!item.cardId) continue;
        if (cardIdPrefix(item.cardId) === parsed.cardIdPrefix) {
          const card = await loadCardForItem(item, cardsById);
          return { item, card: card ?? null };
        }
      }
    }
  }

  return null;
}

export async function processShopifyOrderPaid(input: {
  storeId: string;
  order: ShopifyOrderWebhookPayload;
}): Promise<SoldDetectionResult[]> {
  const lineItems = input.order.line_items ?? [];
  if (!lineItems.length) return [];

  const cardsById = new Map<string, ScannedCard>();
  const results: SoldDetectionResult[] = [];
  const orderId = normalizeShopifyId(input.order.id);

  for (const lineItem of lineItems) {
    const qty = lineItem.quantity ?? 1;
    if (qty <= 0) continue;

    const match = await findInventoryForLineItem(
      input.storeId,
      lineItem,
      cardsById,
    );
    if (!match) continue;

    const { item, card } = match;
    if (item.cardId && cardsById.has(item.cardId) === false && card) {
      cardsById.set(item.cardId, card);
    }

    const lineItemId = normalizeShopifyId(lineItem.id);
    const soldPrice = parseSoldPrice(lineItem.price);
    const alreadySold = isInventorySold(item);

    if (
      alreadySold &&
      item.soldOrderId === orderId &&
      item.soldLineItemId === lineItemId
    ) {
      results.push({
        inventoryItemId: item.id,
        cardId: item.cardId ?? "",
        soldPrice: item.soldPrice ?? soldPrice,
        alreadySold: true,
      });
      continue;
    }

    if (alreadySold) {
      results.push({
        inventoryItemId: item.id,
        cardId: item.cardId ?? "",
        soldPrice: item.soldPrice ?? soldPrice,
        alreadySold: true,
      });
      continue;
    }

    results.push(
      await markInventorySoldFromShopify({
        storeId: input.storeId,
        item,
        card,
        soldPrice,
        soldOrderId: orderId,
        soldLineItemId: lineItemId,
        detectionSource: "orders_paid",
      }),
    );
  }

  return results;
}
