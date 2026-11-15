import assert from "node:assert/strict";
import {
  inferInventoryFinish,
  inventoryFinishBadgeLabel,
  inventoryItemMatchesFinishFilter,
  parseInventoryFinishFilter,
} from "./inventory-finish-v1";

assert.equal(
  inferInventoryFinish({ productName: "Sol Ring (Foil)" }),
  "foil",
);
assert.equal(
  inferInventoryFinish({ productName: "Sol Ring (Surge Foil)" }),
  "surge_foil",
);
assert.equal(
  inferInventoryFinish({ productName: "Sol Ring (Foil Etched)" }),
  "foil_etched",
);
assert.equal(
  inferInventoryFinish({ displayName: "Pikachu (Reverse Holofoil) — Near Mint" }),
  "reverse_holo",
);
assert.equal(
  inferInventoryFinish({ title: "Secret Lair Drop: Rainbow Stairs - Foil Edition" }),
  "foil",
);
assert.equal(inferInventoryFinish({ productName: "Lightning Bolt" }), "nonfoil");
assert.equal(inferInventoryFinish({ productName: "Foil" }), "nonfoil");
assert.equal(
  inferInventoryFinish({ productName: "Foil", displayName: "Foil — Near Mint" }),
  "nonfoil",
);
assert.equal(
  inferInventoryFinish({ productName: "Lightning Bolt (Non-Foil)" }),
  "nonfoil",
);
assert.equal(
  inferInventoryFinish({
    productName: "Lightning Bolt",
    tcgplayerCondition: "Near Mint Foil",
  }),
  "foil",
);
assert.equal(
  inferInventoryFinish({
    productName: "Spark of Genius",
    tcgplayerCondition: "Near Mint Rainbow Foil",
  }),
  "rainbow_foil",
);
assert.equal(
  inferInventoryFinish({
    productName: "Carrion Crown",
    tcgplayerCondition: "Near Mint Cold Foil",
  }),
  "cold_foil",
);
assert.equal(
  inferInventoryFinish({
    productName: "War-Band of Bellona",
    tcgplayerCondition: "Near Mint Gold Foil",
  }),
  "gold_foil",
);
assert.equal(
  inferInventoryFinish({
    productName: "Spark of Genius",
    tcgplayerCondition: "Near Mint",
  }),
  "nonfoil",
);
assert.equal(
  inferInventoryFinish({
    productName: "Fuzzy Eevee Deck Box",
    tcgplayerCondition: "Unopened",
  }),
  "nonfoil",
);
assert.equal(
  inventoryItemMatchesFinishFilter(
    { productName: "Sol Ring", tcgplayerCondition: "Near Mint Foil" },
    "foil",
  ),
  true,
);
assert.equal(inventoryFinishBadgeLabel("surge_foil"), "Surge Foil");
assert.equal(inventoryFinishBadgeLabel("nonfoil"), null);
assert.equal(
  inventoryItemMatchesFinishFilter({ productName: "Sol Ring (Foil)" }, "foil"),
  true,
);
assert.equal(
  inventoryItemMatchesFinishFilter({ productName: "Sol Ring" }, "foil"),
  false,
);
assert.equal(
  inventoryItemMatchesFinishFilter({ productName: "Sol Ring" }, "nonfoil"),
  true,
);
assert.equal(parseInventoryFinishFilter("foil"), "foil");
assert.equal(parseInventoryFinishFilter("whatever"), "all");

console.log("inventory-finish-v1 selftest passed");
