/**
 * Pickup reservations — held units and cart validation.
 * Run: npx tsx scripts/test-pickup-reservations.ts
 */
import assert from "node:assert/strict";
import { reservedQuantities } from "../src/lib/pickup/reservations";
import { toE164Phone } from "../src/lib/shopify/draft-orders";
import { validateCartForCheckout } from "../src/lib/store-inventory/validate-cart";
import type { InventoryItem, PickupReservation } from "../src/lib/types";

function item(id: string, quantity: number): InventoryItem {
  return {
    id,
    storeId: "s1",
    source: "shopify_import",
    displayName: `Card ${id}`,
    itemType: "raw",
    purchaseType: "cash",
    purchasePrice: 0,
    acquiredAt: "2026-10-01T00:00:00.000Z",
    status: "listed",
    quantity,
    quantityOnHand: quantity,
    quantityAvailable: quantity,
    listPrice: 5,
    shopifyListing: { productId: `p-${id}`, variantId: `gid://shopify/ProductVariant/${id}` },
  } as InventoryItem;
}

function reservation(
  status: PickupReservation["status"],
  lines: Array<[string, number]>,
): PickupReservation {
  return {
    id: `r-${status}-${lines.length}`,
    storeId: "s1",
    status,
    customerName: "Test Buyer",
    draftOrderId: "gid://shopify/DraftOrder/1",
    draftOrderName: "#D1",
    lines: lines.map(([inventoryItemId, quantity]) => ({
      inventoryItemId,
      displayName: inventoryItemId,
      variantId: inventoryItemId,
      quantity,
      unitPrice: 5,
    })),
    subtotal: 0,
    reserveUntil: "2026-11-06T00:00:00.000Z",
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
  };
}

const held = reservedQuantities([
  reservation("active", [["a", 1], ["b", 2]]),
  reservation("active", [["a", 1]]),
  reservation("completed", [["c", 1]]),
  reservation("expired", [["b", 5]]),
]);
assert.equal(held.get("a"), 2, "active holds add up");
assert.equal(held.get("b"), 2, "expired holds are ignored");
assert.equal(held.has("c"), false, "completed holds are ignored");

const inventory = [item("a", 3), item("b", 2), item("d", 1)];
const result = validateCartForCheckout(
  [
    { inventoryItemId: "a", quantity: 3 },
    { inventoryItemId: "b", quantity: 1 },
    { inventoryItemId: "d", quantity: 1 },
  ],
  inventory,
  held,
);
const a = result.lines.find((l) => l.inventoryItemId === "a");
assert.equal(a?.quantity, 1, "only unheld copies can be bought");
assert.equal(
  result.rejected.find((r) => r.inventoryItemId === "b")?.message,
  "Held for another customer's pickup.",
  "fully held row is rejected with a pickup reason",
);
assert.ok(result.lines.some((l) => l.inventoryItemId === "d"), "unheld row passes");

assert.equal(
  validateCartForCheckout([{ inventoryItemId: "b", quantity: 1 }], inventory).lines.length,
  1,
  "no holds passed keeps old behaviour",
);

assert.equal(toE164Phone("(555) 123-4567"), "+15551234567");
assert.equal(toE164Phone("1-555-123-4567"), "+15551234567");
assert.equal(toE164Phone("+44 20 7946 0958"), "+442079460958");
assert.equal(toE164Phone("12345"), undefined);

console.log("pickup reservations: ok");
