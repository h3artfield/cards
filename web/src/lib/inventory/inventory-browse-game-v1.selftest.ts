import assert from "node:assert/strict";
import {
  inventoryBrowseGameKey,
  inventoryBrowseGameLabel,
  matchesInventoryBrowseGame,
} from "./inventory-browse-game-v1";
import type { InventoryItem } from "../types";

function item(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: "1",
    storeId: "s",
    source: "tcgplayer_import",
    displayName: "Test",
    quantity: 1,
    ...partial,
  } as InventoryItem;
}

assert.equal(
  inventoryBrowseGameKey(item({ productLine: "Flesh & Blood TCG" })),
  "flesh-blood",
);
assert.equal(
  inventoryBrowseGameKey(item({ productLine: "Lorcana TCG" })),
  "lorcana",
);
assert.equal(
  inventoryBrowseGameKey(item({ productLine: "Pokemon Japan" })),
  "pokemon-japan",
);
assert.equal(inventoryBrowseGameLabel("flesh-blood"), "Flesh & Blood");
assert.equal(inventoryBrowseGameLabel("pokemon-japan"), "Pokemon Japan");
assert.equal(
  matchesInventoryBrowseGame(
    item({ productLine: "One Piece Card Game" }),
    "one-piece",
  ),
  true,
);

console.log("inventory-browse-game-v1 selftest passed");
