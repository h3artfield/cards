import assert from "node:assert/strict";
import { buildGatheringDeckPrefill } from "./gathering-deck-build";

const prefill = buildGatheringDeckPrefill([
  {
    inventoryItemId: "1",
    name: "Gandalf the White",
    qty: 1,
    colorIdentity: ["W"],
    isCommander: true,
    typeLine: "Legendary Creature — Avatar Wizard",
  },
  {
    inventoryItemId: "2",
    name: "Sol Ring",
    qty: 1,
    colorIdentity: [],
  },
  {
    inventoryItemId: "3",
    name: "Wayfarer's Bauble",
    qty: 1,
    colorIdentity: [],
  },
]);

assert.equal(prefill.commanderName, "Gandalf the White");
assert.ok(prefill.deckPreferences.includes("Sol Ring"));
assert.ok(prefill.deckPreferences.includes("Wayfarer's Bauble"));
assert.ok(!prefill.deckPreferences.toLowerCase().includes("gandalf"));

console.log("gathering-deck-build.selftest: ok");
