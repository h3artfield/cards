import {
  inventoryEffectiveQuantity,
  isInventorySold,
} from "../inventory/status";
import type { InventoryItem } from "../types";

export type CartCheckoutRequestLine = {
  inventoryItemId: string;
  quantity: number;
};

export type ValidatedCheckoutLine = {
  inventoryItemId: string;
  displayName: string;
  variantId: string;
  quantity: number;
  /** Requested units, when stock forced us to lower the line. */
  requestedQuantity: number;
  unitPrice: number;
};

export type RejectedCheckoutLine = {
  inventoryItemId: string;
  displayName?: string;
  reason: "not_found" | "sold" | "out_of_stock" | "not_listed" | "no_price";
  message: string;
};

export type CartValidation = {
  lines: ValidatedCheckoutLine[];
  rejected: RejectedCheckoutLine[];
  subtotal: number;
};

/**
 * Check a browser cart against live inventory. Rows that are not on Shopify
 * are rejected rather than silently dropped, so the shopper is told to ask
 * staff instead of losing the card at checkout.
 */
export function validateCartForCheckout(
  requested: CartCheckoutRequestLine[],
  inventory: InventoryItem[],
): CartValidation {
  const byId = new Map(inventory.map((i) => [i.id, i]));
  const lines: ValidatedCheckoutLine[] = [];
  const rejected: RejectedCheckoutLine[] = [];
  const seen = new Set<string>();

  for (const line of requested) {
    const id = line.inventoryItemId;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const item = byId.get(id);
    if (!item) {
      rejected.push({
        inventoryItemId: id,
        reason: "not_found",
        message: "No longer in this store's inventory.",
      });
      continue;
    }

    if (isInventorySold(item)) {
      rejected.push({
        inventoryItemId: id,
        displayName: item.displayName,
        reason: "sold",
        message: "Just sold.",
      });
      continue;
    }

    const available = inventoryEffectiveQuantity(item);
    if (available <= 0) {
      rejected.push({
        inventoryItemId: id,
        displayName: item.displayName,
        reason: "out_of_stock",
        message: "Out of stock.",
      });
      continue;
    }

    const variantId = item.shopifyListing?.variantId;
    if (!variantId) {
      rejected.push({
        inventoryItemId: id,
        displayName: item.displayName,
        reason: "not_listed",
        message: "Not available online yet — ask staff to ring it up in store.",
      });
      continue;
    }

    const unitPrice =
      item.shopifyListing?.exportPrice ??
      item.listPrice ??
      item.tcgMarketPrice ??
      item.marketPrice ??
      0;
    if (unitPrice <= 0) {
      rejected.push({
        inventoryItemId: id,
        displayName: item.displayName,
        reason: "no_price",
        message: "No price on this card — ask staff.",
      });
      continue;
    }

    const requestedQuantity = Math.max(1, Math.trunc(line.quantity) || 1);
    lines.push({
      inventoryItemId: id,
      displayName: item.displayName,
      variantId,
      quantity: Math.min(requestedQuantity, available),
      requestedQuantity,
      unitPrice,
    });
  }

  const subtotal = lines.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity,
    0,
  );

  return { lines, rejected, subtotal: Math.round(subtotal * 100) / 100 };
}
