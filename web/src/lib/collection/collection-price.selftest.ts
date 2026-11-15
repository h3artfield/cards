import assert from "node:assert/strict";
import {
  collectionPriceCategory,
  resolveCollectionPriceLookup,
} from "./collection-price";
import { collectionCardFromPreview } from "./collection-price";
import type { CollectionCard } from "../types";

const bolt: CollectionCard = {
  id: "1",
  storeId: "s",
  customerId: "c",
  frontImageUrl: "https://example.test/bolt.jpg",
  itemType: "raw",
  status: "owned",
  displayName: "Lightning Bolt",
  category: "magic",
  setName: "Limited Edition Alpha",
  cardNumber: "161",
  scryfallId: "abc",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

assert.equal(collectionPriceCategory(bolt), "mtg");

const noCatalog = resolveCollectionPriceLookup(bolt);
assert.equal(noCatalog.identityKey, null);
assert.equal(noCatalog.lookupKeys.length, 0);

const withCatalog = resolveCollectionPriceLookup(bolt, {
  set: "lea",
  collectorNumber: "161",
  tcgplayerId: "12345",
  name: "Lightning Bolt",
});
assert.equal(withCatalog.identityKey, "mtg|LEA|161|nonfoil|normal|en");
const foilBolt = resolveCollectionPriceLookup(
  { ...bolt, finish: "foil" },
  {
    set: "lea",
    collectorNumber: "161",
    tcgplayerId: "12345",
    name: "Lightning Bolt",
  },
);
assert.equal(foilBolt.identityKey, "mtg|LEA|161|foil|normal|en");
assert.equal(withCatalog.tcgplayerProductId, "12345");
assert.ok(withCatalog.lookupKeys.includes("mtg|LEA|161|nonfoil|normal|en"));

const pika: CollectionCard = {
  ...bolt,
  id: "2",
  displayName: "Pikachu",
  category: "pokemon",
  setName: "Paldea Evolved",
  cardNumber: "184",
  scryfallId: undefined,
};
const poke = resolveCollectionPriceLookup(pika);
assert.equal(poke.category, "pokemon");
assert.ok(poke.lookupKeys.some((key) => key.startsWith("pokemon|paldea-evolved|184|")));

const preview = collectionCardFromPreview({
  category: "magic",
  catalogSource: "scryfall",
  catalogId: "abc",
  displayName: "Lightning Bolt",
  setName: "Limited Edition Alpha",
  cardNumber: "161",
});
assert.equal(preview.scryfallId, "abc");
assert.equal(preview.catalogId, "abc");
assert.equal(preview.displayName, "Lightning Bolt");

console.log("PASS  collection price identity lookup");
