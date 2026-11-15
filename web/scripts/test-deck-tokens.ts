import assert from "node:assert/strict";
import cardTokenMap from "../src/lib/deck-tokens/card-tokens-v1.json";
import {
  computeDeckTokensV1,
  deckTokenLabelV1,
  type CardTokenMapV1,
} from "../src/lib/deck-tokens/deck-tokens-v1";

const map: CardTokenMapV1 = {
  version: 1,
  generatedAt: "",
  sourceUpdatedAt: "",
  tokens: {
    treasure: { name: "Treasure", typeLine: "Token Artifact — Treasure", kind: "token", colors: [] },
    soldier: {
      name: "Soldier",
      typeLine: "Token Creature — Soldier",
      kind: "token",
      power: "1",
      toughness: "1",
      colors: ["W"],
    },
    emblem: { name: "Elspeth Emblem", typeLine: "Emblem — Elspeth", kind: "emblem", colors: [] },
  },
  cards: {
    tithe: ["treasure"],
    pitiless: ["treasure"],
    elspeth: ["soldier", "emblem"],
    benched: ["soldier"],
  },
};

const result = computeDeckTokensV1({
  commander: { oracleId: "elspeth", name: "Elspeth" },
  mainboard: [
    { oracleId: "tithe", name: "Smothering Tithe" },
    { oracleId: "pitiless", name: "Pitiless Plunderer" },
    { oracleId: null, name: "Forest" },
    { oracleId: "tithe", name: "Smothering Tithe" },
  ],
  map,
});

assert.deepEqual(
  result.tokens.map((t) => [t.name, t.madeBy]),
  [
    ["Treasure", ["Smothering Tithe", "Pitiless Plunderer"]],
    ["Soldier", ["Elspeth"]],
  ],
);
assert.deepEqual(result.emblems.map((t) => t.name), ["Elspeth Emblem"]);
assert.equal(deckTokenLabelV1(map.tokens.soldier), "1/1 white Soldier");
assert.equal(deckTokenLabelV1(map.tokens.treasure), "Treasure");

const real = cardTokenMap as CardTokenMapV1;
assert.ok(Object.keys(real.cards).length > 3000, "generated map looks too small");
for (const ids of Object.values(real.cards)) {
  for (const id of ids) assert.ok(real.tokens[id], `missing token ${id}`);
}

console.log("deck tokens: ok");
