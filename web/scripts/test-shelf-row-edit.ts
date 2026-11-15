import assert from "node:assert/strict";
import { browseInventoryItems } from "../src/lib/inventory/search";
import {
  applyShelfRowEdit,
  shelfConditionLabel,
  shelfCustomerName,
} from "../src/lib/inventory/shelf-row-edit";
import type { InventoryItem } from "../src/lib/types";

function row(partial: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    storeId: "store-1",
    source: "tcgplayer_import",
    displayName: "Beast Token (Multicolor) — Shards of Alara",
    productName: "Beast Token (Multicolor)",
    setName: "Shards of Alara",
    cardNumber: "10",
    tcgplayerCondition: "Moderately Played",
    condition: "MP",
    quantity: 1,
    quantityOnHand: 1,
    quantityAvailable: 1,
    listPrice: 8,
    acquiredAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const renamed = applyShelfRowEdit(row(), { displayName: "Beast" });
assert.equal(renamed.ok, true);
if (renamed.ok) {
  assert.equal(renamed.item.productName, "Beast");
  assert.equal(renamed.item.displayName, "Beast — Shards of Alara");
  assert.equal(renamed.item.setName, "Shards of Alara");
  assert.equal(renamed.item.cardNumber, "10");
  assert.equal(shelfCustomerName(renamed.item), "Beast");
}

const priced = applyShelfRowEdit(row(), { listPrice: 8.125 });
assert.equal(priced.ok && priced.item.listPrice, 8.13);

const held = applyShelfRowEdit(
  row({ quantityReserved: 1, quantityOnHand: 3, quantity: 3, quantityAvailable: 2 }),
  { quantity: 4 },
);
assert.equal(held.ok, true);
if (held.ok) {
  assert.equal(held.item.quantityAvailable, 4);
  assert.equal(held.item.quantityOnHand, 5);
}

const played = applyShelfRowEdit(row(), { condition: "Lightly Played" });
assert.equal(played.ok, true);
if (played.ok) {
  assert.equal(played.item.tcgplayerCondition, "Lightly Played");
  assert.equal(played.item.condition, "LP");
  assert.equal(shelfConditionLabel(played.item), "Lightly Played");
}

assert.equal(applyShelfRowEdit(row(), { displayName: "   " }).ok, false);
assert.equal(applyShelfRowEdit(row(), { listPrice: -1 }).ok, false);
assert.equal(applyShelfRowEdit(row(), { quantity: 1.5 }).ok, false);

const sorted = browseInventoryItems(
  [
    row({ id: "b", displayName: "Zebra" }),
    row({ id: "a", displayName: "Alpha", quantity: 9, quantityOnHand: 9, quantityAvailable: 9 }),
  ],
  { sort: "name", limit: 10 },
);
assert.deepEqual(
  sorted.items.map((item) => item.id),
  ["a", "b"],
);

console.log("shelf row edit: ok");
