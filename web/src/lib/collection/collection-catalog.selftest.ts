import assert from "node:assert/strict";
import {
  catalogAddMatchKey,
  collectionPrintingMatchKey,
  findOwnedCatalogPrinting,
  inferCatalogSource,
  parseCatalogSource,
  parseCollectionCatalogAdd,
} from "./collection-catalog";
import type { CollectionCard } from "../types";
import { collectionScannerAppHref } from "./collection-scanner-app";

assert.equal(parseCatalogSource("pokemontcg"), "pokemon_tcg");
assert.equal(parseCatalogSource("pokemon_tcg"), "pokemon_tcg");
assert.equal(parseCatalogSource("scryfall"), "scryfall");
assert.equal(inferCatalogSource("yugioh"), "ygoprodeck");

const parsed = parseCollectionCatalogAdd({
  category: "pokemon",
  catalogId: "sv3-1",
  displayName: "Sprigatito",
  setName: "Obsidian Flames",
  cardNumber: "1",
  quantity: "2",
});
assert.ok(parsed);
assert.equal(parsed?.catalogSource, "pokemon_tcg");
assert.equal(parsed?.quantity, 2);
assert.equal(catalogAddMatchKey(parsed!), "pokemon_tcg:sv3-1:nonfoil");

assert.equal(
  parseCollectionCatalogAdd({ displayName: "Sprigatito" }),
  null,
);

const owned: CollectionCard = {
  id: "c1",
  storeId: "s",
  customerId: "u",
  frontImageUrl: "https://example.test/pika.jpg",
  itemType: "raw",
  status: "owned",
  displayName: "Pikachu",
  category: "pokemon",
  catalogSource: "pokemon_tcg",
  catalogId: "sv3-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

assert.equal(collectionPrintingMatchKey(owned), "pokemon_tcg:sv3-1:nonfoil");
assert.equal(
  findOwnedCatalogPrinting([owned], "pokemon_tcg:sv3-1:nonfoil")?.id,
  "c1",
);

const magic: CollectionCard = {
  ...owned,
  id: "c2",
  category: "magic",
  catalogSource: "scryfall",
  catalogId: "aaaa",
  scryfallId: "aaaa",
  displayName: "Sol Ring",
};
assert.equal(collectionPrintingMatchKey(magic), "scryfall:aaaa:nonfoil");
assert.equal(
  collectionPrintingMatchKey({ ...magic, finish: "foil" }),
  "scryfall:aaaa:foil",
);

assert.equal(
  collectionScannerAppHref("the-game-lodge"),
  "cards9k://scan?store=the-game-lodge",
);

console.log("PASS  collection catalog add parse");
