import assert from "node:assert/strict";
import {
  addManyPileCards,
  addPileCard,
  parseStoredPile,
  pileStorageKey,
  removePileCard,
  togglePileCard,
  type PileCard,
} from "./pile";

const bolt: PileCard = {
  inventoryItemId: "inv-1",
  name: "Lightning Bolt",
  qty: 2,
  colorIdentity: ["R"],
};

const ring: PileCard = {
  inventoryItemId: "inv-2",
  name: "Sol Ring",
  qty: 1,
  colorIdentity: [],
};

assert.equal(pileStorageKey("the-game-lodge"), "cs9k-pile:the-game-lodge");

const added = addPileCard([], bolt);
assert.equal(added.length, 1);
assert.equal(addPileCard(added, bolt).length, 1);

const many = addManyPileCards(added, [bolt, ring]);
assert.equal(many.length, 2);

assert.equal(removePileCard(many, "inv-1").length, 1);
assert.equal(togglePileCard(many, bolt).length, 1);
assert.equal(togglePileCard([], bolt).length, 1);

assert.deepEqual(parseStoredPile(null), []);
assert.equal(parseStoredPile("not-json").length, 0);
assert.equal(
  parseStoredPile(JSON.stringify([{ inventoryItemId: "inv-1", name: "Bolt" }]))
    .length,
  1,
);
assert.equal(
  parseStoredPile(JSON.stringify([{ name: "missing id" }])).length,
  0,
);

console.log("pile.selftest passed");
