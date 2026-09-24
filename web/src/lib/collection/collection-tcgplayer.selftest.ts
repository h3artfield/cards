import assert from "node:assert/strict";
import {
  chooseTcgplayerUnitPrice,
  collectionTcgplayerSearchQueries,
  pickTcgplayerSearchHit,
} from "./collection-tcgplayer";

assert.equal(chooseTcgplayerUnitPrice(2.1, 2.4), 2.1);
assert.equal(chooseTcgplayerUnitPrice(10334.4, 8.5), 8.5);
assert.equal(chooseTcgplayerUnitPrice(undefined, 3.2), 3.2);
assert.equal(chooseTcgplayerUnitPrice(1.5, undefined), 1.5);

assert.deepEqual(
  collectionTcgplayerSearchQueries({
    displayName: "Lightning Bolt",
    setName: "Limited Edition Alpha",
    cardNumber: "161",
  }),
  [
    "Lightning Bolt Limited Edition Alpha 161",
    "Lightning Bolt Limited Edition Alpha",
    "Lightning Bolt",
  ],
);

const boltHits = [
  {
    productId: 1,
    productName: "Lightning Bolt Booster Box",
    productLineName: "Magic: The Gathering",
    setName: "Limited Edition Alpha",
  },
  {
    productId: 2,
    productName: "Lightning Bolt",
    productLineName: "Magic: The Gathering",
    setName: "Limited Edition Alpha",
    customAttributes: { number: "161" },
  },
  {
    productId: 3,
    productName: "Chain Lightning",
    productLineName: "Magic: The Gathering",
    setName: "Limited Edition Alpha",
  },
];

const picked = pickTcgplayerSearchHit(boltHits, {
  displayName: "Lightning Bolt",
  setName: "Limited Edition Alpha",
  cardNumber: "161",
  category: "magic",
});
assert.equal(picked?.productId, 2);

const rejectedSealed = pickTcgplayerSearchHit(
  [
    {
      productId: 9,
      productName: "Lightning Bolt Collector Booster Box",
      productLineName: "Magic: The Gathering",
    },
  ],
  { displayName: "Lightning Bolt", category: "magic" },
);
assert.equal(rejectedSealed, undefined);

console.log("PASS  collection tcgplayer search pick");
