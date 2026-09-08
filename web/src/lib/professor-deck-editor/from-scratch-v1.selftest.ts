import assert from "node:assert";
import { createEditableDeckFromScratchV1, handDeckIdV1 } from "./from-scratch-v1";
import { editableDeckIdV1 } from "./from-build-v1";
import { handDeckImportOpsV1 } from "./import-ops-v1";
import { applyDeckEditOpsV1 } from "./ops-v1";
import { checkEditableDeckLegalityV1, isProfessorEndorsedV1 } from "./legality-v1";
import { mainboardLibraryCountV1 } from "./types-v1";
import type { DeckEditorCardFactsV1 } from "./legality-v1";
import type { ProfessorImportedResolvedCardV111 } from "../deck-synthesis/professor-imported-decklist-v1-1-1";

/**
 * Starting a deck by hand, and filling it from a pasted list.
 *
 * The cases worth pinning down are the ones where a hand deck differs from a
 * Professor deck: it has no build behind it, no baseline to revert to, and no
 * requested bracket. Everything after that has to behave identically, because
 * the editor, the reducer and the legality checker are shared.
 */

const COMMANDER = {
  oracleId: "o-atraxa",
  name: "Atraxa, Praetors' Voice",
  colorIdentity: ["W", "U", "B", "G"],
};

function scratch() {
  return createEditableDeckFromScratchV1({
    deckId: handDeckIdV1({ customerId: "cust1", handle: "abc123" }),
    customerId: "cust1",
    storeId: "store1",
    storeSlug: "the-game-lodge",
    commander: COMMANDER,
    now: "2026-01-01T00:00:00Z",
  });
}

function imported(
  over: Partial<ProfessorImportedResolvedCardV111> & { sourceName: string },
): ProfessorImportedResolvedCardV111 {
  return {
    copies: 1,
    resolved: true,
    name: over.sourceName,
    oracleId: `o-${over.sourceName.toLowerCase().replace(/\s+/g, "-")}`,
    typeLine: "Artifact",
    isLand: false,
    commanderLegal: true,
    colorIdentity: [],
    offColor: false,
    ...over,
  };
}

// The three fields that make a hand deck a hand deck.
const empty = scratch();
assert.equal(empty.buildId, null);
assert.deepEqual(empty.baselineCards, []);
assert.equal(empty.bracket, null);
assert.deepEqual(empty.cards, []);
assert.equal(empty.revision, 0);
assert.equal(empty.editedByUser, false);
// Named after the commander when the customer does not name it themselves.
assert.equal(empty.deckName, COMMANDER.name);

// A supplied name wins, and is trimmed.
assert.equal(
  createEditableDeckFromScratchV1({ ...empty, deckName: "  Superfriends  ", now: empty.createdAt })
    .deckName,
  "Superfriends",
);

// Hand ids must never collide with the build-keyed scheme, or opening a deck
// by build id could land on a deck somebody typed out by hand.
assert.equal(handDeckIdV1({ customerId: "cust1", handle: "abc123" }), "cust1_hand-abc123");
assert.notEqual(
  handDeckIdV1({ customerId: "cust1", handle: "abc123" }),
  editableDeckIdV1({ customerId: "cust1", buildId: "abc123" }),
);

// An empty deck is never the Professor's, so the "your edits" notice and the
// revert button both stay away from it however much it is edited.
assert.equal(isProfessorEndorsedV1(empty), false);

// Reverting has nothing to revert to, and says so rather than emptying the deck.
const reverted = applyDeckEditOpsV1({
  deck: empty,
  ops: [{ op: "revertToBaseline" }],
  now: "2026-01-01T00:00:01Z",
});
assert.equal(reverted.changed, false);
assert.equal(reverted.rejected[0]?.reason, "This deck has no Professor baseline to restore");

// A pasted list becomes ordinary addCard operations.
const ops = handDeckImportOpsV1({
  cards: [
    imported({ sourceName: "Sol Ring" }),
    imported({ sourceName: "Forest", copies: 8, isLand: true }),
    // Unresolved cards are imported under the name that was typed, with no
    // oracle id, so the legality report can name them as unmatched.
    imported({ sourceName: "Sol Rong", resolved: false, oracleId: null, name: "" }),
  ],
});
assert.deepEqual(ops, [
  { op: "addCard", oracleId: "o-sol-ring", name: "Sol Ring", board: "mainboard", copies: 1, isLand: false },
  { op: "addCard", oracleId: "o-forest", name: "Forest", board: "mainboard", copies: 8, isLand: true },
  { op: "addCard", oracleId: null, name: "Sol Rong", board: "mainboard", copies: 1, isLand: false },
]);

// And those operations survive the real reducer.
const filled = applyDeckEditOpsV1({ deck: empty, ops, now: "2026-01-01T00:00:02Z" });
assert.deepEqual(filled.rejected, []);
assert.equal(filled.applied, 3);
assert.equal(filled.deck.revision, 1);
// Copies count, not rows: eight Forests are eight cards.
assert.equal(mainboardLibraryCountV1(filled.deck), 10);
// Imported cards are the customer's, not the Professor's, so they can be removed.
assert.ok(filled.deck.cards.every((card) => card.origin === "user"));

// A list with two copies of a non-basic is rejected per card rather than
// failing the whole import — the rest of the paste still lands.
const dupes = handDeckImportOpsV1({ cards: [imported({ sourceName: "Counterspell", copies: 2 })] });
const partial = applyDeckEditOpsV1({ deck: filled.deck, ops: dupes, now: "2026-01-01T00:00:03Z" });
assert.equal(partial.changed, false);
assert.match(partial.rejected[0]?.reason ?? "", /not a basic land/);

// Legality on a hand deck reports the shortfall as incomplete, never illegal:
// a deck being built is not a deck that breaks the rules.
const facts: DeckEditorCardFactsV1 = {
  oracleId: null,
  name: "",
  colorIdentity: [],
  commanderLegal: true,
  isLand: false,
};
const legality = checkEditableDeckLegalityV1({
  deck: filled.deck,
  lookup: (card) => ({ ...facts, oracleId: card.oracleId, name: card.name }),
});
assert.equal(legality.commanderLegal, true);
assert.equal(legality.professorEndorsed, false);
assert.equal(legality.mainboardLibraryCount, 10);
const size = legality.violations.find((v) => v.kind === "deck_size");
assert.equal(size?.severity, "incomplete");
assert.equal(size?.message, "89 cards short of 99");

console.log("from-scratch-v1 selftest passed");
