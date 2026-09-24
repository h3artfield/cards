/**
 * Tests for the deck edit reducer and the Commander legality contract.
 *
 * These are written against the failure modes the competitors have visibly hit:
 * losing card metadata on a maybeboard round trip, letting an off-colour card
 * sit in a deck marked legal, and two tabs clobbering each other.
 */
import assert from "node:assert/strict";
import { applyDeckEditOpsV1 } from "./ops-v1";
import type { DeckEditOpV1 } from "./ops-v1";
import { checkEditableDeckLegalityV1, isProfessorEndorsedV1 } from "./legality-v1";
import type { DeckEditorCardFactsV1 } from "./legality-v1";
import { createEditableDeckFromBuildV1 } from "./from-build-v1";
import { deckCardKeyV1, PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION } from "./types-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildResultV111,
} from "../deck-synthesis/professor-sol-directed-build-types-v1-1-1";

const NOW = "2026-09-04T00:00:00.000Z";
const LATER = "2026-09-04T01:00:00.000Z";

/** Fynn, the Fangbearer — the deck this whole editor work started from. */
const COMMANDER = { oracleId: "cmd-fynn", name: "Fynn, the Fangbearer", colorIdentity: ["G"] };

function professorCard(
  name: string,
  overrides: Partial<EditableDeckCardV1> = {},
): EditableDeckCardV1 {
  const oracleId = overrides.oracleId ?? `o-${name.toLowerCase().replace(/\s+/g, "-")}`;
  return {
    cardKey: deckCardKeyV1({ oracleId, name }),
    oracleId,
    name,
    copies: 1,
    board: "mainboard",
    isLand: false,
    isBasicLand: false,
    origin: "professor",
    professor: {
      primaryArchitectRequirement: "REQ-POISON",
      primaryRole: "poison_payoff",
      secondaryRoles: ["evasion"],
      packageMembership: ["deathtouch-core"],
      whyInThisDeck: `${name} turns any deathtouch body into a poison clock.`,
      structuralNecessity: "FLEX",
    },
    markerIds: [],
    primaryMarkerId: null,
    ...overrides,
  };
}

function forest(copies: number): EditableDeckCardV1 {
  return {
    cardKey: deckCardKeyV1({ oracleId: null, name: "Forest" }),
    oracleId: null,
    name: "Forest",
    copies,
    board: "mainboard",
    isLand: true,
    isBasicLand: true,
    origin: "professor",
    professor: null,
    markerIds: [],
    primaryMarkerId: null,
  };
}

/** A 99-card mainboard: 66 spells plus 33 Forests. */
function fynnDeck(overrides: Partial<EditableDeckV1> = {}): EditableDeckV1 {
  const spells = Array.from({ length: 66 }, (_, i) => professorCard(`Spell ${i + 1}`));
  const cards = [...spells, forest(33)];
  return {
    version: PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION,
    deckId: "cust-1_build-1",
    buildId: "build-1",
    customerId: "cust-1",
    storeId: "store-1",
    storeSlug: "the-game-lodge",
    deckName: "Fynn, the Fangbearer — Grindy",
    bracket: 3,
    commander: COMMANDER,
    cards,
    markers: [],
    baselineCards: cards.map((c) => ({ ...c })),
    editedByUser: false,
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function apply(deck: EditableDeckV1, ops: DeckEditOpV1[]) {
  return applyDeckEditOpsV1({ deck, ops, now: LATER });
}

/** Green, legal, non-land — the default for cards the tests do not care about. */
const greenFacts: DeckEditorCardFactsV1 = {
  oracleId: null,
  name: "",
  colorIdentity: ["G"],
  commanderLegal: true,
  isLand: false,
};

function lookupAllGreen(card: EditableDeckCardV1): DeckEditorCardFactsV1 {
  return { ...greenFacts, oracleId: card.oracleId, name: card.name };
}

// ---------------------------------------------------------------------------

function testMoveToConsideringPreservesProfessorRationale() {
  const deck = fynnDeck();
  const key = deck.cards[0]!.cardKey;
  const before = deck.cards[0]!.professor;

  const moved = apply(deck, [{ op: "moveCard", cardKey: key, board: "considering" }]);
  const after = moved.deck.cards.find((c) => c.cardKey === key)!;

  assert.equal(moved.applied, 1);
  assert.equal(after.board, "considering");
  assert.deepEqual(
    after.professor,
    before,
    "the Professor's reasoning must survive a board move — it cannot be regenerated",
  );

  const back = applyDeckEditOpsV1({
    deck: moved.deck,
    ops: [{ op: "moveCard", cardKey: key, board: "mainboard" }],
    now: LATER,
  });
  const returned = back.deck.cards.find((c) => c.cardKey === key)!;
  assert.equal(returned.board, "mainboard");
  assert.deepEqual(returned.professor, before, "and a round trip must be lossless");
  console.log("PASS  board moves preserve Professor provenance");
}

function testRevisionAdvancesOnlyOnRealChange() {
  const deck = fynnDeck();
  const noop = apply(deck, [{ op: "renameDeck", deckName: deck.deckName }]);

  assert.equal(noop.changed, false);
  assert.equal(noop.applied, 0);
  assert.equal(noop.deck.revision, 0, "a rejected batch must not burn a revision");
  assert.equal(noop.rejected.length, 1);

  const real = apply(deck, [{ op: "renameDeck", deckName: "Fynn Poison v2" }]);
  assert.equal(real.deck.revision, 1);
  assert.equal(real.deck.updatedAt, LATER);
  assert.equal(real.deck.editedByUser, true);
  console.log("PASS  revision advances only on an accepted change");
}

function testPartialBatchKeepsTheGoodOps() {
  const deck = fynnDeck();
  const key = deck.cards[0]!.cardKey;

  const result = apply(deck, [
    { op: "moveCard", cardKey: key, board: "cut" },
    { op: "assignMarker", cardKey: key, markerId: "d:nonexistent" },
  ]);

  assert.equal(result.applied, 1, "the move should land even though the marker op failed");
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0]!.index, 1, "rejections point at the submitted row");
  assert.equal(result.deck.cards.find((c) => c.cardKey === key)!.board, "cut");
  console.log("PASS  a partial batch keeps the operations that succeeded");
}

function testSingletonEnforcedOnAddAndSetCopies() {
  const deck = fynnDeck();

  const dupe = apply(deck, [
    { op: "addCard", oracleId: "o-sol-ring", name: "Sol Ring", board: "mainboard", copies: 2 },
  ]);
  assert.equal(dupe.applied, 0);
  assert.match(dupe.rejected[0]!.reason, /not a basic land/);

  const bump = apply(deck, [{ op: "setCopies", cardKey: deck.cards[0]!.cardKey, copies: 3 }]);
  assert.equal(bump.applied, 0);
  assert.match(bump.rejected[0]!.reason, /not a basic land/);

  const forests = apply(deck, [
    { op: "setCopies", cardKey: deckCardKeyV1({ oracleId: null, name: "Forest" }), copies: 30 },
  ]);
  assert.equal(forests.applied, 1, "basics are exempt from singleton");
  console.log("PASS  singleton is enforced on add and on copy changes, basics exempt");
}

function testReAddingAnOffboardCardMovesItBack() {
  const deck = fynnDeck();
  const card = deck.cards[0]!;
  const parked = apply(deck, [{ op: "moveCard", cardKey: card.cardKey, board: "considering" }]);

  // Searching for a card you already parked and hitting Add should bring it
  // home, not create a second copy that then fails the legality check.
  const readded = applyDeckEditOpsV1({
    deck: parked.deck,
    ops: [
      { op: "addCard", oracleId: card.oracleId, name: card.name, board: "mainboard" },
    ],
    now: LATER,
  });

  const matches = readded.deck.cards.filter((c) => c.cardKey === card.cardKey);
  assert.equal(matches.length, 1, "no duplicate entry");
  assert.equal(matches[0]!.board, "mainboard");
  assert.deepEqual(matches[0]!.professor, card.professor, "and it keeps its rationale");
  console.log("PASS  re-adding a parked card moves it back instead of duplicating it");
}

function testDeletingAMarkerClearsItsAssignments() {
  const deck = fynnDeck();
  const key = deck.cards[0]!.cardKey;

  const setup = apply(deck, [
    { op: "createMarker", label: "Need to buy", scope: "deck" },
    { op: "assignMarker", cardKey: key, markerId: "d:need-to-buy" },
  ]);
  const card = setup.deck.cards.find((c) => c.cardKey === key)!;
  assert.deepEqual(card.markerIds, ["d:need-to-buy"]);
  assert.equal(card.primaryMarkerId, "d:need-to-buy", "first marker becomes the grouping marker");

  const removed = applyDeckEditOpsV1({
    deck: setup.deck,
    ops: [{ op: "deleteMarker", markerId: "d:need-to-buy" }],
    now: LATER,
  });
  const cleared = removed.deck.cards.find((c) => c.cardKey === key)!;
  assert.deepEqual(cleared.markerIds, [], "no card may point at a deleted marker");
  assert.equal(cleared.primaryMarkerId, null);
  console.log("PASS  deleting a marker clears every assignment to it");
}

function testRevertRestoresTheListButKeepsMarkers() {
  const deck = fynnDeck();
  const key = deck.cards[0]!.cardKey;

  const edited = apply(deck, [
    { op: "createMarker", label: "Owned", scope: "global" },
    { op: "assignMarker", cardKey: key, markerId: "g:owned" },
    { op: "removeCard", cardKey: deck.cards[1]!.cardKey },
    { op: "addCard", oracleId: "o-sol-ring", name: "Sol Ring", board: "mainboard" },
  ]);
  assert.equal(edited.deck.editedByUser, true);
  assert.equal(isProfessorEndorsedV1(edited.deck), false);

  const reverted = applyDeckEditOpsV1({
    deck: edited.deck,
    ops: [{ op: "revertToBaseline" }],
    now: LATER,
  });

  assert.equal(isProfessorEndorsedV1(reverted.deck), true, "the Professor's list is back");
  assert.equal(reverted.deck.editedByUser, false, "so the stale-grade notice goes away");
  assert.equal(
    reverted.deck.cards.some((c) => c.name === "Sol Ring"),
    false,
    "the user's addition is gone",
  );
  assert.deepEqual(
    reverted.deck.cards.find((c) => c.cardKey === key)!.markerIds,
    ["g:owned"],
    "but the user's own annotations are theirs and survive",
  );
  assert.deepEqual(reverted.deck.markers.map((m) => m.id), ["g:owned"]);
  console.log("PASS  revert restores the sealed list and keeps user markers");
}

function testBaselineDoesNotDriftWithTheWorkingCopy() {
  const deck = fynnDeck();
  const edited = apply(deck, [{ op: "removeCard", cardKey: deck.cards[0]!.cardKey }]);

  assert.equal(edited.deck.cards.length, 66, "65 spells plus the Forest entry");
  assert.equal(
    edited.deck.baselineCards.length,
    67,
    "the baseline must not follow the working copy",
  );
  console.log("PASS  the baseline is immune to edits of the working copy");
}

// --- legality ---------------------------------------------------------------

function testOffColourAdditionIsIllegalButStillStored() {
  const deck = fynnDeck();
  const withIsland = apply(deck, [
    { op: "removeCard", cardKey: deck.cards[0]!.cardKey },
    { op: "addCard", oracleId: "o-rhystic", name: "Rhystic Study", board: "mainboard" },
  ]);

  const report = checkEditableDeckLegalityV1({
    deck: withIsland.deck,
    lookup: (card) =>
      card.name === "Rhystic Study"
        ? { ...greenFacts, name: card.name, colorIdentity: ["U"] }
        : lookupAllGreen(card),
  });

  assert.equal(report.mainboardLibraryCount, 99, "the count is still right");
  assert.equal(report.commanderLegal, false);
  const violation = report.violations.find((v) => v.kind === "color_identity");
  assert.ok(violation, "an off-colour card must be reported");
  assert.match(violation!.message, /Blue — not allowed in deck colour identity/);
  // The edit is still stored. Blocking the write would lose the customer's work
  // over a mistake they may be one more edit away from fixing.
  assert.equal(withIsland.applied, 2);
  console.log("PASS  an off-colour card is reported illegal but the edit is not discarded");
}

function testMidEditCountIsIncompleteNotIllegal() {
  const deck = fynnDeck();
  const short = apply(deck, [{ op: "removeCard", cardKey: deck.cards[0]!.cardKey }]);

  const report = checkEditableDeckLegalityV1({ deck: short.deck, lookup: lookupAllGreen });
  assert.equal(report.mainboardLibraryCount, 98);
  assert.equal(report.commanderLegal, true, "98 cards mid-swap is not an illegal deck");
  const size = report.violations.find((v) => v.kind === "deck_size");
  assert.equal(size!.severity, "incomplete");
  assert.equal(size!.message, "1 card short of 99");
  console.log("PASS  a deck mid-edit reads as incomplete, not illegal");
}

function testConsideringAndCutAreOutsideTheDeck() {
  const deck = fynnDeck();
  // Park a card and add a replacement: the deck is back to 99 even though it
  // now holds 100 card entries.
  const swapped = apply(deck, [
    { op: "moveCard", cardKey: deck.cards[0]!.cardKey, board: "considering" },
    { op: "addCard", oracleId: "o-snake-umbra", name: "Snake Umbra", board: "mainboard" },
  ]);

  const report = checkEditableDeckLegalityV1({ deck: swapped.deck, lookup: lookupAllGreen });
  assert.equal(report.mainboardLibraryCount, 99);
  assert.equal(report.commanderLegal, true);
  assert.equal(
    report.professorEndorsed,
    false,
    "a card sitting in Considering is not in the deck the Professor graded",
  );
  console.log("PASS  Considering and Cut do not count toward the 99");
}

function testBannedCardIsCaught() {
  const deck = fynnDeck();
  const withBanned = apply(deck, [
    { op: "removeCard", cardKey: deck.cards[0]!.cardKey },
    { op: "addCard", oracleId: "o-primeval", name: "Primeval Titan", board: "mainboard" },
  ]);

  const report = checkEditableDeckLegalityV1({
    deck: withBanned.deck,
    lookup: (card) =>
      card.name === "Primeval Titan"
        ? { ...greenFacts, name: card.name, commanderLegal: false }
        : lookupAllGreen(card),
  });

  assert.equal(report.commanderLegal, false);
  assert.match(report.violations.find((v) => v.kind === "banned")!.message, /not legal in Commander/);
  console.log("PASS  a banned card makes the deck illegal");
}

function testMissingCommanderColorsDoNotCrashLegality() {
  const deck = fynnDeck();
  const stripped = {
    ...deck,
    commander: { ...deck.commander, colorIdentity: undefined as unknown as string[] },
  };
  const report = checkEditableDeckLegalityV1({ deck: stripped, lookup: lookupAllGreen });
  assert.equal(typeof report.commanderLegal, "boolean");
  console.log("PASS  a stored deck missing commander colors still opens");
}

function testUnknownCardIsUnresolvedRatherThanLegal() {
  const deck = fynnDeck();
  const report = checkEditableDeckLegalityV1({
    deck,
    lookup: (card) => (card.name === "Spell 1" ? null : lookupAllGreen(card)),
  });

  assert.deepEqual(report.unresolvedCardKeys, [deck.cards[0]!.cardKey]);
  const violation = report.violations.find((v) => v.kind === "unresolved_card");
  assert.equal(violation!.severity, "incomplete", "unknown is not the same as illegal");
  assert.equal(report.commanderLegal, true);
  console.log("PASS  a card with no catalog match reads as unknown, not legal or illegal");
}

function testMarkersAndRenameDoNotBreakEndorsement() {
  const deck = fynnDeck();
  const annotated = apply(deck, [
    { op: "createMarker", label: "Owned", scope: "global" },
    { op: "assignMarker", cardKey: deck.cards[0]!.cardKey, markerId: "g:owned" },
    { op: "renameDeck", deckName: "My Fynn deck" },
  ]);

  const report = checkEditableDeckLegalityV1({ deck: annotated.deck, lookup: lookupAllGreen });
  assert.equal(
    report.professorEndorsed,
    true,
    "annotating a list does not change the list the Professor graded",
  );
  console.log("PASS  markers and renames leave Professor endorsement intact");
}

function testSetCommanderPromotesAndDemotes() {
  const deck = fynnDeck();
  const spell = deck.cards[0]!;
  const promoted = apply(deck, [
    {
      op: "setCommander",
      oracleId: spell.oracleId!,
      name: spell.name,
      colorIdentity: ["G", "U"],
    },
  ]);

  assert.equal(promoted.applied, 1);
  assert.equal(promoted.deck.commander.name, spell.name);
  assert.deepEqual(promoted.deck.commander.colorIdentity, ["G", "U"]);
  assert.equal(
    promoted.deck.cards.some((card) => card.cardKey === spell.cardKey),
    false,
    "the new commander leaves the 99",
  );
  const demoted = promoted.deck.cards.find((card) => card.name === COMMANDER.name);
  assert.ok(demoted, "the old commander returns to the mainboard");
  assert.equal(demoted!.board, "mainboard");
  assert.equal(demoted!.origin, "user");

  const sameAgain = apply(promoted.deck, [
    {
      op: "setCommander",
      oracleId: spell.oracleId!,
      name: spell.name,
      colorIdentity: ["G", "U"],
    },
  ]);
  assert.equal(sameAgain.changed, false);
  assert.match(sameAgain.rejected[0]!.reason, /already the commander/);
  console.log("PASS  setCommander promotes a card and demotes the previous commander");
}

function testSetCommanderFromOutsideTheDeck() {
  const deck = fynnDeck();
  const swapped = apply(deck, [
    {
      op: "setCommander",
      oracleId: "cmd-ayara",
      name: "Ayara, First of Locthwain",
      colorIdentity: ["B"],
    },
  ]);

  assert.equal(swapped.applied, 1);
  assert.equal(swapped.deck.commander.name, "Ayara, First of Locthwain");
  assert.ok(
    swapped.deck.cards.some((card) => card.name === COMMANDER.name && card.board === "mainboard"),
  );
  assert.equal(swapped.deck.cards.length, deck.cards.length + 1);
  console.log("PASS  setCommander can install a card that was not yet in the deck");
}

// --- handoff from a sealed build -------------------------------------------

function buildFixture(overrides: {
  status?: SolDirectedBuildResultV111["status"];
  userId?: string | null;
  constructedDeck?: SolDirectedBuildResultV111["constructedDeck"];
}) {
  const job = {
    buildId: "build-1",
    userId: overrides.userId === undefined ? "cust-1" : overrides.userId,
    storeId: "store-1",
    storeSlug: "the-game-lodge",
    commanderName: "Fynn, the Fangbearer",
    bracket: 3,
    playstyle: "Grindy",
  } as unknown as SolDirectedBuildJobRecordV111;

  const result = {
    buildId: "build-1",
    status: overrides.status ?? "COMPLETE",
    commander: COMMANDER,
    constructedDeck:
      overrides.constructedDeck === undefined
        ? {
            lands: [
              { name: "Forest", copies: 33 },
              { name: "Castle Garenbrig", copies: 1 },
            ],
            nonlands: [
              {
                oracleId: "o-snake-umbra",
                name: "Snake Umbra",
                primaryArchitectRequirement: "REQ-POISON",
                primaryRole: "poison_payoff",
                secondaryRoles: ["card_advantage"],
                packageMembership: ["deathtouch-core"],
                whyInThisDeck: "Draws off every deathtouch connection.",
                structuralNecessity: "FLEX",
              },
            ],
          }
        : overrides.constructedDeck,
  } as unknown as SolDirectedBuildResultV111;

  return { job, result };
}

function testHandoffCarriesRationaleAndSeedsTheBaseline() {
  const { job, result } = buildFixture({});
  const created = createEditableDeckFromBuildV1({ job, result, now: NOW });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const deck = created.deck;
  assert.equal(deck.deckId, "cust-1_build-1");
  assert.equal(deck.revision, 0);
  assert.equal(deck.editedByUser, false);
  assert.equal(isProfessorEndorsedV1(deck), true, "a fresh handoff is endorsed by definition");

  const spell = deck.cards.find((c) => c.name === "Snake Umbra")!;
  assert.equal(spell.origin, "professor");
  assert.equal(spell.professor!.whyInThisDeck, "Draws off every deathtouch connection.");

  const forestCard = deck.cards.find((c) => c.name === "Forest")!;
  assert.equal(forestCard.copies, 33);
  assert.equal(forestCard.isBasicLand, true);
  assert.equal(forestCard.oracleId, null, "lands carry no id in the constructed deck");
  assert.equal(forestCard.cardKey, "n:forest", "so they fall back to a name key");

  const utility = deck.cards.find((c) => c.name === "Castle Garenbrig")!;
  assert.equal(utility.isLand, true);
  assert.equal(utility.isBasicLand, false);
  console.log("PASS  handoff carries Professor rationale and seeds the baseline");
}

function testLandResolverUpgradesLandKeysWhenAvailable() {
  const { job, result } = buildFixture({});
  const created = createEditableDeckFromBuildV1({
    job,
    result,
    now: NOW,
    resolveLandOracleId: (name) => (name === "Forest" ? "o-forest" : null),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const forestCard = created.deck.cards.find((c) => c.name === "Forest")!;
  assert.equal(forestCard.oracleId, "o-forest");
  assert.equal(forestCard.cardKey, "o:o-forest");
  console.log("PASS  a land id resolver upgrades land keys without changing anything else");
}

function testHandoffRefusesWhatCannotBeEdited() {
  const running = createEditableDeckFromBuildV1({ ...buildFixture({ status: "VALIDATING" }), now: NOW });
  assert.equal(running.ok, false);
  if (!running.ok) assert.equal(running.failure, "BUILD_INCOMPLETE");

  const deckless = createEditableDeckFromBuildV1({
    ...buildFixture({ constructedDeck: null }),
    now: NOW,
  });
  assert.equal(deckless.ok, false);
  if (!deckless.ok) assert.equal(deckless.failure, "NO_CONSTRUCTED_DECK");

  const ownerless = createEditableDeckFromBuildV1({ ...buildFixture({ userId: null }), now: NOW });
  assert.equal(ownerless.ok, false);
  if (!ownerless.ok) assert.equal(ownerless.failure, "NO_OWNER");
  console.log("PASS  handoff refuses builds with no deck, no owner, or no finish");
}

const tests = [
  testMoveToConsideringPreservesProfessorRationale,
  testRevisionAdvancesOnlyOnRealChange,
  testPartialBatchKeepsTheGoodOps,
  testSingletonEnforcedOnAddAndSetCopies,
  testReAddingAnOffboardCardMovesItBack,
  testDeletingAMarkerClearsItsAssignments,
  testRevertRestoresTheListButKeepsMarkers,
  testBaselineDoesNotDriftWithTheWorkingCopy,
  testOffColourAdditionIsIllegalButStillStored,
  testMidEditCountIsIncompleteNotIllegal,
  testConsideringAndCutAreOutsideTheDeck,
  testBannedCardIsCaught,
  testMissingCommanderColorsDoNotCrashLegality,
  testUnknownCardIsUnresolvedRatherThanLegal,
  testMarkersAndRenameDoNotBreakEndorsement,
  testSetCommanderPromotesAndDemotes,
  testSetCommanderFromOutsideTheDeck,
  testHandoffCarriesRationaleAndSeedsTheBaseline,
  testLandResolverUpgradesLandKeysWhenAvailable,
  testHandoffRefusesWhatCannotBeEdited,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${test.name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
