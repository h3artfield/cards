import assert from "node:assert/strict";
import {
  buildOwnedCardIndex,
  cardOwnershipTag,
  isCardOwned,
  normalizeCardName,
} from "../src/lib/collection/owned-index";
import type { CollectionCard } from "../src/lib/types";

function card(overrides: Partial<CollectionCard> = {}): CollectionCard {
  return {
    id: "c1",
    storeId: "store-1",
    customerId: "cust-1",
    frontImageUrl: "https://example.test/front.jpg",
    itemType: "raw",
    displayName: "Lightning Bolt",
    status: "owned",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function main() {
  assert.equal(normalizeCardName("Lightning Bolt"), "lightning bolt");
  assert.equal(normalizeCardName("Jace, the Mind Sculptor"), "jace the mind sculptor");
  assert.equal(
    normalizeCardName("Fire // Ice"),
    "fire",
    "double-faced cards match on the front face",
  );
  assert.equal(normalizeCardName("Æther Vial"), "aether vial");
  assert.equal(normalizeCardName(undefined), "");

  const index = buildOwnedCardIndex([
    card({ scryfallId: "sf-1", oracleId: "or-1" }),
    card({ id: "c2", displayName: "Sol Ring" }),
    card({
      id: "c3",
      displayName: "Demonic Tutor",
      status: "sent_to_buyback",
    }),
    card({ id: "c4", displayName: "Mana Crypt", status: "sold_to_store" }),
  ]);

  assert.equal(index.count, 2, "traded-away cards are no longer owned");

  assert.ok(isCardOwned({ scryfallId: "sf-1" }, index));
  assert.ok(isCardOwned({ oracleId: "or-1" }, index));
  assert.ok(
    isCardOwned({ scryfallId: "other-printing", name: "lightning bolt" }, index),
    "a different printing of the same card still counts as owned",
  );
  assert.ok(isCardOwned({ name: "Sol Ring" }, index));
  assert.equal(isCardOwned({ name: "Demonic Tutor" }, index), false);
  assert.equal(isCardOwned({ name: "Mana Crypt" }, index), false);
  assert.equal(isCardOwned({ name: "Counterspell" }, index), false);
  assert.equal(isCardOwned({}, index), false);

  const empty = buildOwnedCardIndex([]);
  assert.equal(isCardOwned({ name: "Sol Ring" }, empty), false);

  assert.equal(
    cardOwnershipTag({ name: "Sol Ring", inStock: true }, index),
    "owned",
    "owning it beats buying it",
  );
  assert.equal(
    cardOwnershipTag({ name: "Counterspell", inStock: true }, index),
    "shop",
  );
  assert.equal(
    cardOwnershipTag({ name: "Counterspell", inStock: false }, index),
    "unavailable",
  );

  console.log("owned index: all assertions passed");
}

main();
