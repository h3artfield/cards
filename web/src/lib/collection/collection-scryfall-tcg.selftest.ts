import assert from "node:assert/strict";
import { pickScryfallTcgMarket } from "./collection-scryfall-tcg";

const picked = pickScryfallTcgMarket(
  [
    { name: "Brainstorm", prices: { usd: null } },
    {
      name: "Harmonized Trio // Brainstorm",
      prices: { usd: "0.71" },
      tcgplayer_id: 688683,
    },
    {
      name: "Brainstorm",
      prices: { usd: "1.38" },
      tcgplayer_id: 171438,
    },
    {
      name: "Brainstorm",
      prices: { usd: "2.10" },
      tcgplayer_id: 99,
    },
  ],
  "Brainstorm",
);

assert.deepEqual(picked, { price: 1.38, tcgplayerId: "171438" });

assert.equal(
  pickScryfallTcgMarket([{ name: "Brainstorm", prices: { usd: null } }], "Brainstorm"),
  undefined,
);

console.log("PASS  collection scryfall tcg market pick");
