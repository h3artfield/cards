import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  CardCandidateBundle,
  LockedCardIdentity,
} from "../src/lib/card-flow-v2/types";
import type { CollectionCard, Customer, VisionResult } from "../src/lib/types";

const STORE_ID = "collection-store";
const CUSTOMER_ID = "collection-customer";

function lockedIdentity(
  overrides: Partial<LockedCardIdentity> = {},
): LockedCardIdentity {
  return {
    locked: true,
    lockStatus: "locked",
    confidence: 0.92,
    category: "magic",
    canonicalName: "Sol Ring",
    catalogSource: "scryfall",
    catalogId: "scryfall-sol-ring",
    setName: "Commander 2021",
    collectorNumber: "263",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "",
    ...overrides,
  };
}

function bundle(identity: LockedCardIdentity): CardCandidateBundle {
  return {
    category: identity.category,
    suspects: [],
    suspectAssessments: [],
    lockedIdentity: identity,
    candidateGenerationNotes: [],
    createdAt: new Date().toISOString(),
  };
}

function collectionCard(
  overrides: Partial<CollectionCard> = {},
): CollectionCard {
  const now = new Date().toISOString();
  return {
    id: "card-1",
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    frontImageUrl: "https://example.test/front.jpg",
    backImageUrl: "https://example.test/back.jpg",
    itemType: "raw",
    category: "magic",
    displayName: "Sol Ring",
    status: "owned",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function customer(): Customer {
  const now = new Date().toISOString();
  return {
    id: CUSTOMER_ID,
    role: "customer",
    firstName: "Case",
    lastName: "Tester",
    email: "case@example.test",
    phone: "555-0100",
    storeId: STORE_ID,
    emailVerified: true,
    authProviders: ["email"],
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "collection-scans-"));
  process.chdir(tmp);

  const { getStorageMode, dataStore } = await import(
    "../src/lib/storage/data-store"
  );
  assert.equal(
    getStorageMode(),
    "memory",
    "this test requires the in-memory dev store (unset Firebase admin env vars)",
  );

  const {
    UNIDENTIFIED_COLLECTION_CARD_NAME,
    buildCollectionCard,
    identityFromV2Bundle,
    identityFromVision,
    unidentifiedIdentity,
  } = await import("../src/lib/collection/collection-intake");
  const {
    collectionCardToScannedCard,
    selectSendableCollectionCards,
    sendCollectionCardsToBuyback,
  } = await import("../src/lib/collection/send-to-buyback");
  const { DEFAULT_STORE_SETTINGS } = await import("../src/lib/constants");

  const identity = identityFromV2Bundle(bundle(lockedIdentity()), "raw");
  assert.equal(identity.displayName, "Sol Ring");
  assert.equal(identity.setName, "Commander 2021");
  assert.equal(identity.cardNumber, "263");
  assert.equal(identity.catalogSource, "scryfall");
  assert.equal(identity.catalogId, "scryfall-sol-ring");
  assert.equal(identity.identityLocked, true);
  assert.equal(identity.needsReview, false);

  const unnamed = identityFromV2Bundle(
    bundle(lockedIdentity({ canonicalName: "  ", marketProductName: undefined })),
    "raw",
  );
  assert.equal(unnamed.displayName, UNIDENTIFIED_COLLECTION_CARD_NAME);
  assert.equal(unnamed.needsReview, true);

  const vision = {
    category: "sports",
    itemType: "graded",
    cardName: "",
    playerName: "Wade Boggs",
    setName: "1988 Donruss",
    cardNumber: "26",
    conditionEstimate: "LP",
    confidence: 0.7,
  } as unknown as VisionResult;
  const fromVision = identityFromVision(vision, "raw");
  assert.equal(fromVision.displayName, "Wade Boggs");
  assert.equal(fromVision.itemType, "graded");
  assert.equal(fromVision.conditionEstimate, "LP");
  assert.equal(fromVision.needsReview, false);
  assert.ok(fromVision.visionJson);

  assert.equal(
    unidentifiedIdentity("unknown").displayName,
    UNIDENTIFIED_COLLECTION_CARD_NAME,
  );

  const built = buildCollectionCard({
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    frontImageUrl: "https://example.test/front.jpg",
    identity,
    magic: { scryfallId: "scryfall-sol-ring", oracleId: "oracle-sol-ring" },
  });
  assert.equal(built.status, "owned");
  assert.equal(built.scryfallId, "scryfall-sol-ring");
  assert.equal(built.oracleId, "oracle-sol-ring");
  assert.equal(built.displayName, "Sol Ring");

  // Selection only accepts the caller's own owned cards at this store.
  const mine = collectionCard();
  const sentAlready = collectionCard({
    id: "card-sent",
    status: "sent_to_buyback",
  });
  const otherCustomer = collectionCard({
    id: "card-other-customer",
    customerId: "someone-else",
  });
  const otherStore = collectionCard({
    id: "card-other-store",
    storeId: "different-store",
  });

  const selection = selectSendableCollectionCards(
    [mine, sentAlready, otherCustomer, otherStore],
    [
      "card-1",
      "card-1",
      "card-sent",
      "card-other-customer",
      "card-other-store",
      "card-missing",
    ],
    { storeId: STORE_ID, customerId: CUSTOMER_ID },
  );
  assert.deepEqual(
    selection.sendable.map((c) => c.id),
    ["card-1"],
  );
  assert.deepEqual(selection.skipped, [
    { id: "card-sent", reason: "already_sent" },
    { id: "card-other-customer", reason: "not_found" },
    { id: "card-other-store", reason: "not_found" },
    { id: "card-missing", reason: "not_found" },
  ]);

  const now = new Date().toISOString();
  const scanned = collectionCardToScannedCard(mine, "order-1", now);
  assert.equal(scanned.orderId, "order-1");
  assert.equal(scanned.frontImageUrl, mine.frontImageUrl);
  assert.equal(scanned.detectedName, "Sol Ring");
  assert.equal(scanned.status, "pending");

  const unidentifiedScan = collectionCardToScannedCard(
    collectionCard({ displayName: UNIDENTIFIED_COLLECTION_CARD_NAME }),
    "order-1",
    now,
  );
  assert.equal(
    unidentifiedScan.detectedName,
    undefined,
    "an unidentified binder card must not pass a placeholder name to staff",
  );

  // Storage is scoped per store and per customer.
  await dataStore.saveCollectionCard(collectionCard({ id: "stored-1" }));
  await dataStore.saveCollectionCard(
    collectionCard({ id: "stored-2", customerId: "someone-else" }),
  );
  await dataStore.saveCollectionCard(
    collectionCard({ id: "stored-3", storeId: "different-store" }),
  );

  let listed = await dataStore.getCollectionCards(STORE_ID, CUSTOMER_ID);
  assert.deepEqual(
    listed.map((c) => c.id),
    ["stored-1"],
  );

  const store = {
    id: STORE_ID,
    ...DEFAULT_STORE_SETTINGS,
    storeName: "Collection Test Store",
    storeSlug: "collection-test-store",
  };
  const result = await sendCollectionCardsToBuyback({
    store,
    customer: customer(),
    cardIds: ["stored-1", "stored-2"],
  });
  assert.equal(result.cards.length, 1);
  assert.equal(result.order.storeId, STORE_ID);
  assert.equal(result.order.status, "scanning");
  assert.deepEqual(result.skipped, [
    { id: "stored-2", reason: "not_found" },
  ]);

  const orderCards = await dataStore.getCardsByOrder(result.order.id);
  assert.equal(orderCards.length, 1);
  assert.equal(orderCards[0]!.frontImageUrl, mine.frontImageUrl);

  listed = await dataStore.getCollectionCards(STORE_ID, CUSTOMER_ID);
  assert.equal(listed[0]!.status, "sent_to_buyback");
  assert.equal(listed[0]!.buybackOrderId, result.order.id);
  assert.equal(listed[0]!.buybackCardId, orderCards[0]!.id);

  // A card already on an order cannot be sent again.
  await assert.rejects(
    sendCollectionCardsToBuyback({
      store,
      customer: customer(),
      cardIds: ["stored-1"],
    }),
    /Select at least one card/,
  );

  await dataStore.deleteCollectionCard("stored-1");
  listed = await dataStore.getCollectionCards(STORE_ID, CUSTOMER_ID);
  assert.equal(listed.length, 0);

  console.log("collection scans: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
