import assert from "node:assert/strict";
import { riftboundPublicCodeForItem } from "./game-catalog-images";
import type { InventoryItem } from "../types";

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "test",
    storeId: "store",
    displayName: "Test",
    status: "on_hand",
    quantity: 1,
    ...overrides,
  } as InventoryItem;
}

assert.equal(
  riftboundPublicCodeForItem(
    item({ setName: "Origins", cardNumber: "043/298", productLine: "Riftbound" }),
  ),
  "OGN-043/298",
);

assert.equal(
  riftboundPublicCodeForItem(
    item({ setName: "Unleashed", cardNumber: "149a/219", productLine: "Riftbound" }),
  ),
  "UNL-149a/219",
);

console.log("game-catalog-images: all assertions passed");
