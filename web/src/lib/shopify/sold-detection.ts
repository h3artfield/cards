import type { InventoryItem, ScannedCard } from "../types";
import { dataStore } from "../storage/data-store";
import { parseShopifySku } from "./product-builder";
import { withSaleLog } from "../inventory/sale-log";
import {
  inventoryEffectiveQuantity,
  inventoryEffectiveStatus,
  isCatalogImportItem,
  isInventorySold,
} from "./inventory-status";
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
  /** Units this webhook consumed. */
  quantitySold?: number;
  /** Units still on the row — 0 means the row is now sold out. */
  remainingQuantity?: number;
  /** A sold-out row came back because Shopify's count rose above zero. */
  restocked?: boolean;
};

const MAX_TRACKED_SALE_REFS = 50;

/** Stable key for one Shopify sale against one inventory row. */
export function shopifySaleRef(
  orderId: string | undefined,
  lineItemId: string | undefined,
): string | null {
  if (!orderId) return null;
  return lineItemId ? `${orderId}:${lineItemId}` : orderId;
}

export function isSaleAlreadyApplied(
  item: InventoryItem,
  ref: string | null,
): boolean {
  if (!ref) return false;
  return Boolean(item.shopifySoldLineItemIds?.includes(ref));
}

function withSaleRef(
  item: InventoryItem,
  ref: string | null,
): string[] | undefined {
  if (!ref) return item.shopifySoldLineItemIds;
  return [...(item.shopifySoldLineItemIds ?? []), ref].slice(
    -MAX_TRACKED_SALE_REFS,
  );
}

/**
 * Imported rows hold many copies, so one sale decrements instead of closing
 * the row. Buyback singles have no quantity fields and always go to zero.
 */
export function applySaleToQuantities(
  item: InventoryItem,
  quantitySold: number,
): { item: InventoryItem; remaining: number } {
  const sold = Math.max(1, Math.trunc(quantitySold));
  if (!isCatalogImportItem(item)) {
    return { item, remaining: 0 };
  }

  const remaining = Math.max(0, inventoryEffectiveQuantity(item) - sold);
  const decrement = (value: number | undefined): number | undefined =>
    value == null ? undefined : Math.max(0, value - sold);

  return {
    item: {
      ...item,
      quantity: decrement(item.quantity),
      quantityOnHand: decrement(item.quantityOnHand),
      quantityAvailable: decrement(item.quantityAvailable),
    },
    remaining,
  };
}

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

export type CatalogShopifyQuantityPlan =
  | { action: "ignore" }
  | { action: "unchanged" }
  | {
      action: "sync";
      quantity: number;
      status: NonNullable<InventoryItem["status"]>;
      sellOut: boolean;
      restore: boolean;
    };

/**
 * Shopify's available count is the stock for this row. A sale that leaves
 * copies and a refund that puts a copy back both land here. Withdrawn rows
 * stay withdrawn. Buyback singles are not quantity-tracked and are ignored.
 */
export function planCatalogQuantityFromShopify(
  item: InventoryItem,
  available: number,
): CatalogShopifyQuantityPlan {
  if (!isCatalogImportItem(item)) return { action: "ignore" };
  if (inventoryEffectiveStatus(item) === "withdrawn") return { action: "ignore" };

  const nextQty = Math.max(0, Math.trunc(available));
  const sold = isInventorySold(item);
  if (nextQty === 0) {
    if (sold) return { action: "unchanged" };
    return {
      action: "sync",
      quantity: 0,
      status: "sold",
      sellOut: true,
      restore: false,
    };
  }

  if (!sold && inventoryEffectiveQuantity(item) === nextQty) {
    return { action: "unchanged" };
  }

  return {
    action: "sync",
    quantity: nextQty,
    status: sold ? (item.shopifyListing ? "listed" : "on_hand") : inventoryEffectiveStatus(item),
    sellOut: false,
    restore: sold,
  };
}

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
  quantitySold?: number;
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
      remainingQuantity: 0,
    };
  }

  const ref = shopifySaleRef(input.soldOrderId, input.soldLineItemId);
  if (isSaleAlreadyApplied(item, ref)) {
    return {
      inventoryItemId: item.id,
      cardId: item.cardId ?? "",
      soldPrice: input.soldPrice,
      alreadySold: true,
      remainingQuantity: inventoryEffectiveQuantity(item),
    };
  }

  const now = new Date().toISOString();
  const quantitySold = Math.max(1, Math.trunc(input.quantitySold ?? 1));
  const { item: decremented, remaining } = applySaleToQuantities(
    item,
    quantitySold,
  );

  const saleLog = withSaleLog(item, {
    at: now,
    quantity: inventoryEffectiveQuantity(item) - remaining,
    unitPrice: input.soldPrice,
    channel: "shopify",
  });

  if (remaining > 0) {
    await dataStore.saveInventoryItem({
      ...decremented,
      saleLog,
      shopifySoldLineItemIds: withSaleRef(item, ref),
      shopifyListing: decremented.shopifyListing
        ? {
            ...decremented.shopifyListing,
            syncedQuantity: remaining,
            syncedAt: now,
          }
        : undefined,
    });

    await dataStore.logAdminAction({
      action: "inventory_sold_shopify",
      metadata: {
        inventoryItemId: item.id,
        orderId: input.soldOrderId,
        lineItemId: input.soldLineItemId,
        soldPrice: input.soldPrice,
        quantitySold,
        remainingQuantity: remaining,
        displayName: item.displayName,
        detectionSource: input.detectionSource,
      },
    });

    return {
      inventoryItemId: item.id,
      cardId: item.cardId ?? "",
      soldPrice: input.soldPrice,
      alreadySold: false,
      quantitySold,
      remainingQuantity: remaining,
    };
  }

  const updatedItem: InventoryItem = {
    ...decremented,
    status: "sold",
    soldAt: now,
    soldChannel: "shopify",
    soldPrice: input.soldPrice,
    soldOrderId: input.soldOrderId,
    soldLineItemId: input.soldLineItemId,
    shopifySoldLineItemIds: withSaleRef(item, ref),
    saleLog,
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
      quantitySold,
      remainingQuantity: 0,
      displayName: item.displayName,
      detectionSource: input.detectionSource,
    },
  });

  return {
    inventoryItemId: item.id,
    cardId: item.cardId ?? "",
    soldPrice: input.soldPrice,
    alreadySold: false,
    quantitySold,
    remainingQuantity: 0,
  };
}

export async function processShopifyInventoryLevelUpdate(input: {
  storeId: string;
  payload: ShopifyInventoryLevelPayload;
  /** Ignore updates from a location other than the shelf's stocking location. */
  defaultLocationId?: string;
}): Promise<SoldDetectionResult | null> {
  const available = input.payload.available;
  if (available == null || !Number.isFinite(available)) return null;

  const eventLocation = normalizeShopifyResourceId(input.payload.location_id);
  const homeLocation = normalizeShopifyResourceId(input.defaultLocationId);
  if (eventLocation && homeLocation && eventLocation !== homeLocation) return null;

  const cardsById = new Map<string, ScannedCard>();
  const match = await findInventoryByShopifyInventoryItemId(
    input.storeId,
    String(input.payload.inventory_item_id),
    cardsById,
  );
  if (!match) return null;

  const { item, card } = match;

  // A pickup draft's reservation also lowers "available"; that card is held,
  // not sold. The sale is recorded when the draft is paid.
  const reservations = await dataStore.getPickupReservations(input.storeId);
  const held = reservations.some(
    (r) =>
      r.status === "active" &&
      r.lines.some((line) => line.inventoryItemId === item.id),
  );
  if (held) return null;

  if (isCatalogImportItem(item)) {
    return syncCatalogQuantityFromShopify({
      item,
      card,
      available,
    });
  }

  if (available > 0) return null;

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
    quantitySold: Math.max(1, inventoryEffectiveQuantity(item)),
    soldOrderId: `inventory_level:${inventoryItemId}`,
    detectionSource: "inventory_levels_update",
  });
}

async function syncCatalogQuantityFromShopify(input: {
  item: InventoryItem;
  card: ScannedCard | null;
  available: number;
}): Promise<SoldDetectionResult | null> {
  const plan = planCatalogQuantityFromShopify(input.item, input.available);
  if (plan.action !== "sync") return null;

  const now = new Date().toISOString();
  const previous = inventoryEffectiveQuantity(input.item);
  const listing = input.item.shopifyListing;
  const base: InventoryItem = {
    ...input.item,
    quantity: plan.quantity,
    quantityOnHand: plan.quantity,
    quantityAvailable: plan.quantity,
    status: plan.status,
    shopifyListing: listing
      ? { ...listing, syncedQuantity: plan.quantity, syncedAt: now }
      : undefined,
  };

  let updated: InventoryItem = {
    ...base,
    saleLog: withSaleLog(input.item, {
      at: now,
      quantity: previous - plan.quantity,
      unitPrice: listing?.exportPrice ?? input.item.listPrice ?? input.item.marketPrice ?? 0,
      channel: "shopify",
    }),
  };
  if (plan.sellOut) {
    updated = {
      ...updated,
      soldAt: now,
      soldChannel: "shopify",
      soldPrice: listing?.exportPrice ?? input.item.marketPrice ?? 0,
    };
  }

  await dataStore.saveInventoryItem(updated);
  if (plan.restore) {
    await dataStore.clearInventoryShopifySale(updated.id);
  }

  if (input.card && plan.sellOut) {
    await dataStore.saveCard({
      ...input.card,
      shopifyExport: {
        ...(input.card.shopifyExport ?? { status: "exported" }),
        status: input.card.shopifyExport?.status ?? "exported",
        soldAt: now,
      },
    });
  }

  await dataStore.logAdminAction({
    action: plan.restore
      ? "inventory_restock_shopify"
      : "inventory_sold_shopify",
    metadata: {
      inventoryItemId: updated.id,
      displayName: updated.displayName,
      previousQuantity: previous,
      quantity: plan.quantity,
      detectionSource: "inventory_levels_update",
    },
  });

  return {
    inventoryItemId: updated.id,
    cardId: updated.cardId ?? "",
    soldPrice: updated.soldPrice ?? listing?.exportPrice ?? 0,
    alreadySold: false,
    quantitySold: plan.sellOut ? previous : 0,
    remainingQuantity: plan.quantity,
    restocked: plan.restore,
  };
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
        quantitySold: qty,
        soldOrderId: orderId,
        soldLineItemId: lineItemId,
        detectionSource: "orders_paid",
      }),
    );
  }

  return results;
}
