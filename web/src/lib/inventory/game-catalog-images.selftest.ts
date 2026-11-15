import assert from "node:assert/strict";
import {
  fabPrintIdAgrees,
  onePieceCardCode,
  onePieceImageUrls,
  riftboundPublicCodeForItem,
} from "./game-catalog-images";
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

assert.equal(fabPrintIdAgrees("LGS435", "LGS435-CF"), true);
assert.equal(fabPrintIdAgrees("MPW028", "MPW028"), true);
assert.equal(fabPrintIdAgrees("SEA189", "OMN243"), false);
assert.equal(
  onePieceCardCode(item({ cardNumber: "EB04-058", productName: "Borsalino" })),
  "EB04-058",
);
assert.deepEqual(
  onePieceImageUrls(
    item({
      productLine: "One Piece Card Game",
      cardNumber: "EB04-058",
      productName: "Borsalino (Alternate Art)",
    }),
  ),
  [
    "https://en.onepiece-cardgame.com/images/cardlist/card/EB04-058_p1.png",
    "https://en.onepiece-cardgame.com/images/cardlist/card/EB04-058_p2.png",
    "https://en.onepiece-cardgame.com/images/cardlist/card/EB04-058.png",
  ],
);
assert.deepEqual(
  onePieceImageUrls(
    item({ cardNumber: "EB04-013", productName: "Carrot" }),
  ),
  ["https://en.onepiece-cardgame.com/images/cardlist/card/EB04-013.png"],
);

console.log("game-catalog-images: all assertions passed");
