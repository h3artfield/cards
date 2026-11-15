import assert from "node:assert/strict";
import { inventoryPriceHistoryKeys } from "../src/lib/store-inventory/inventory-price-history-keys";

const foil = inventoryPriceHistoryKeys({
  gameKey: "magic",
  setCode: "eoe",
  collectorNumber: "240",
  foil: true,
  name: "The Endstone",
  setName: "Edge of Eternities",
});
assert.equal(foil[0], "mtg|EOE|240|foil|normal|en");
assert.ok(foil.includes("mtg|EOE|240|nonfoil|normal|en"));

const showcase = inventoryPriceHistoryKeys({
  gameKey: "magic",
  setCode: "mh3",
  collectorNumber: "391p",
  foil: false,
  name: "The Endstone (Showcase)",
  setName: "Modern Horizons 3",
});
assert.equal(showcase[0], "mtg|MH3|391|nonfoil|showcase|en");
assert.ok(showcase.includes("mtg|MH3|391|nonfoil|normal|en"));

const missing = inventoryPriceHistoryKeys({
  gameKey: "magic",
  collectorNumber: "20",
  foil: false,
});
assert.deepEqual(missing, []);

console.log("inventory price history keys: ok");
