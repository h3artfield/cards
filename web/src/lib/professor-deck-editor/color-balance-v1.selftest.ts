import assert from "node:assert/strict";
import {
  computeDeckColorBalanceV1,
  parseColoredPipsV1,
} from "./color-balance-v1";

assert.deepEqual(parseColoredPipsV1("{2}{G}{G}"), { W: 0, U: 0, B: 0, R: 0, G: 2 });
assert.deepEqual(parseColoredPipsV1("{W}{U}"), { W: 1, U: 1, B: 0, R: 0, G: 0 });
assert.deepEqual(parseColoredPipsV1("{G/U}{1}"), { W: 0, U: 1, B: 0, R: 0, G: 1 });
assert.deepEqual(parseColoredPipsV1("{3}"), { W: 0, U: 0, B: 0, R: 0, G: 0 });
assert.deepEqual(parseColoredPipsV1(null), { W: 0, U: 0, B: 0, R: 0, G: 0 });

assert.equal(
  computeDeckColorBalanceV1({ commanderColors: ["G"], cards: [] }),
  null,
  "mono-color decks do not get a balance strip",
);

const threeColor = computeDeckColorBalanceV1({
  commanderColors: ["B", "R", "G"],
  cards: [
    { copies: 1, isLand: false, manaCost: "{2}{G}{G}" },
    { copies: 1, isLand: false, manaCost: "{B}{R}" },
    { copies: 1, isLand: true, producedMana: ["G"] },
    { copies: 1, isLand: true, producedMana: ["B", "R"] },
    { copies: 8, isLand: true, producedMana: ["G"] },
  ],
});
assert.ok(threeColor);
assert.deepEqual(
  threeColor.rows.map((row) => [row.color, row.demand, row.sources]),
  [
    ["B", 1, 1],
    ["R", 1, 1],
    ["G", 2, 9],
  ],
);
assert.match(threeColor.warning ?? "", /Black|Red/, "a 1-source color with demand is called out");

const landIdentityFallback = computeDeckColorBalanceV1({
  commanderColors: ["W", "U"],
  cards: [
    { copies: 1, isLand: false, manaCost: "{W}{W}{U}" },
    { copies: 6, isLand: true, producedMana: [], colorIdentity: ["W"] },
    { copies: 6, isLand: true, producedMana: [], colorIdentity: ["U"] },
  ],
});
assert.ok(landIdentityFallback);
assert.equal(landIdentityFallback.rows.find((row) => row.color === "W")?.sources, 6);
assert.equal(landIdentityFallback.warning, null);

console.log("color-balance-v1 selftest: all assertions passed");
