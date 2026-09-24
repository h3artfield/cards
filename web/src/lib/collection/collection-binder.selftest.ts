import assert from "node:assert/strict";
import {
  cardMatchesCollectionGame,
  collectionDecklistText,
  defaultBinderMode,
  filterBinderCards,
  isCollectionCommander,
  pickDeckCommander,
} from "./collection-binder";
import { parseCollectionGame } from "./collection-game";
import type { CollectionCard } from "../types";

function card(partial: Partial<CollectionCard> & { id: string; displayName: string }): CollectionCard {
  return {
    storeId: "s",
    customerId: "c",
    frontImageUrl: "https://example.test/card.jpg",
    itemType: "raw",
    status: "owned",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

assert.equal(parseCollectionGame("pokemon"), "pokemon");
assert.equal(parseCollectionGame("nope"), "magic");

const atra = card({
  id: "1",
  displayName: "Atraxa, Praetors' Voice",
  category: "magic",
  typeLine: "Legendary Creature — Phyrexian Angel Horror",
  canBeCommander: true,
  setName: "Commander 2016",
  quantity: 1,
  createdAt: "2026-01-02T00:00:00.000Z",
});
const bolt = card({
  id: "2",
  displayName: "Lightning Bolt",
  category: "magic",
  typeLine: "Instant",
  setName: "Limited Edition Alpha",
  quantity: 3,
  createdAt: "2026-01-03T00:00:00.000Z",
});
const pika = card({
  id: "3",
  displayName: "Pikachu",
  category: "pokemon",
  createdAt: "2026-01-04T00:00:00.000Z",
});
const review = card({
  id: "4",
  displayName: "Black Lotus",
  category: "magic",
  needsReview: true,
  visionJson: {
    importCandidates: [{ scryfallId: "x", name: "Black Lotus", setCode: "lea", collectorNumber: "1" }],
  },
});

assert.equal(isCollectionCommander(atra), true);
assert.equal(isCollectionCommander(bolt), false);
assert.equal(
  isCollectionCommander(
    card({
      id: "teferi",
      displayName: "Teferi, Hero of Dominaria",
      typeLine: "Legendary Planeswalker — Teferi",
      canBeCommander: false,
    }),
  ),
  false,
);
assert.equal(
  isCollectionCommander(
    card({
      id: "fow",
      displayName: "Force of Will",
      typeLine: "Instant",
      canBeCommander: false,
    }),
  ),
  false,
);
assert.equal(cardMatchesCollectionGame(pika, "pokemon"), true);
assert.equal(cardMatchesCollectionGame(pika, "magic"), false);
assert.equal(cardMatchesCollectionGame(bolt, "magic"), true);

const magicView = filterBinderCards([atra, bolt, pika, review], {
  game: "magic",
  sort: "name",
});
assert.deepEqual(
  magicView.map((row) => row.displayName),
  ["Atraxa, Praetors' Voice", "Lightning Bolt"],
);

const commanders = filterBinderCards([atra, bolt], {
  game: "magic",
  filter: "commanders",
});
assert.equal(commanders.length, 1);
assert.equal(commanders[0]?.id, "1");

assert.equal(defaultBinderMode([review, atra]), "import");
assert.equal(defaultBinderMode([atra, bolt]), "view");
assert.equal(defaultBinderMode([]), "import");

assert.equal(pickDeckCommander([bolt, atra])?.id, "1");
assert.equal(
  collectionDecklistText([atra, bolt], atra.id),
  "3 Lightning Bolt",
);

console.log("PASS  collection binder game filter + commander deck seed");
