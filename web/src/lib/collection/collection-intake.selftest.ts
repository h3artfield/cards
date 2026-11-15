import assert from "node:assert/strict";
import {
  UNIDENTIFIED_COLLECTION_CARD_NAME,
  collectionScryfallQuery,
} from "./collection-intake";

assert.equal(
  collectionScryfallQuery({
    displayName: "Brainstorm",
    setName: "Reality Fracture Commander",
    cardNumber: "39",
  }),
  '!"Brainstorm" set:"Reality Fracture Commander" cn:39 game:paper unique:prints',
);

assert.equal(
  collectionScryfallQuery({ displayName: UNIDENTIFIED_COLLECTION_CARD_NAME }),
  "",
);

console.log("PASS  collection scryfall query");
