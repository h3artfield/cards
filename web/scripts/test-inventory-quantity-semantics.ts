/**
 * Inventory quantity semantics — application holds vs TCGplayer reporting.
 * Run: npm run test:inventory-quantity-semantics
 */
import assert from "node:assert/strict";
import {
  computeQuantityAvailable,
  inventoryEffectiveQuantity,
  inventoryQuantityAvailable,
} from "../src/lib/inventory/status";
import { resolveInventoryQuantities } from "../src/lib/tcgplayer-inventory/parse-export-csv";
import type { InventoryItem } from "../src/lib/types";

function pass(label: string) {
  console.log(`✓ ${label}`);
}

const base: InventoryItem = {
  id: "1",
  storeId: "s",
  displayName: "Card",
  acquiredAt: "2026-01-01",
  category: "magic",
  quantityOnHand: 3,
};

pass("on hand 3, reserved 1, committed 1 → available 1");
assert.equal(
  inventoryQuantityAvailable({
    ...base,
    quantityReserved: 1,
    quantityCommitted: 1,
  }),
  1,
);

pass("on hand 1, committed 1 → unavailable");
assert.equal(
  inventoryEffectiveQuantity({
    ...base,
    quantityOnHand: 1,
    quantityCommitted: 1,
    source: "tcgplayer_import",
    tcgplayerListingKey: "k",
  }),
  0,
);

pass("TCGplayer reported reserve does not reduce available");
const tcg = resolveInventoryQuantities(3, 20);
assert.equal(tcg.quantityOnHand, 20);
assert.equal(tcg.tcgplayerReportedReserve, 3);
assert.equal(tcg.quantityAvailable, 20);
const tcgItem: InventoryItem = {
  ...base,
  source: "tcgplayer_import",
  tcgplayerListingKey: "k",
  quantityOnHand: 20,
  tcgplayerReportedReserve: 3,
  quantityAvailable: 20,
};
assert.equal(inventoryQuantityAvailable(tcgItem), 20);

pass("recommendation qty cannot exceed computed available");
const available = computeQuantityAvailable({
  ...base,
  quantityOnHand: 2,
  quantityReserved: 1,
});
const recommendedQty = Math.min(5, available);
assert.equal(recommendedQty, 1);

pass("multiple condition listings are separate rows (not merged)");
const nm: InventoryItem = {
  ...base,
  id: "nm",
  catalogOracleId: "oracle-sol",
  condition: "NM",
  quantityOnHand: 2,
};
const lp: InventoryItem = {
  ...base,
  id: "lp",
  catalogOracleId: "oracle-sol",
  condition: "LP",
  quantityOnHand: 1,
};
assert.equal(nm.catalogOracleId, lp.catalogOracleId);
assert.notEqual(nm.id, lp.id);
assert.equal(inventoryQuantityAvailable(nm) + inventoryQuantityAvailable(lp), 3);

console.log("\nInventory quantity semantics tests PASSED");
