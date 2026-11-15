import assert from "node:assert/strict";
import {
  createSolDirectedBuildJobV111,
  saveSolDirectedBuildResultV111,
} from "../src/lib/deck-synthesis/professor-sol-directed-build-job-store-v1-1-1";
import {
  normalizeSolDirectedBuildUserInputsV111,
  type SolDirectedBuildResultV111,
} from "../src/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import { mergeCustomerDeckListV1 } from "../src/lib/professor-deck-editor/deck-list-v1";
import { createEditableDeckFromScratchV1 } from "../src/lib/professor-deck-editor/from-scratch-v1";
import { applyDeckEditOpsV1 } from "../src/lib/professor-deck-editor/ops-v1";
import {
  createEditableDeckIfAbsentV1,
  getEditableDeckV1,
  recordProfessorReviewV1,
} from "../src/lib/professor-deck-editor/store-v1";

async function main() {
  const base = {
    commanderOracleId: "cmd",
    bracket: 3,
    playstyle: "Balanced",
    deckTheme: "",
    winPreference: "",
    commanderStyle: "x",
  };
  assert.equal(normalizeSolDirectedBuildUserInputsV111({ ...base, mode: "review", sourceDeckId: " d1 " }).sourceDeckId, "d1");
  assert.equal(normalizeSolDirectedBuildUserInputsV111({ ...base, mode: "build", sourceDeckId: "d1" }).sourceDeckId, undefined);
  assert.ok(!("sourceDeckId" in normalizeSolDirectedBuildUserInputsV111({ ...base, mode: "review" })));

  const now = new Date().toISOString();
  let deck = createEditableDeckFromScratchV1({
    deckId: "c1_hand-test",
    customerId: "c1",
    storeId: "s1",
    storeSlug: "shop",
    commander: { oracleId: "cmd", name: "Commander", colorIdentity: ["G"] },
    now,
  });
  deck = applyDeckEditOpsV1({
    deck,
    ops: [
      { op: "addCard", oracleId: "a", name: "Old Card", board: "mainboard" },
      { op: "addCard", oracleId: "b", name: "Other Card", board: "mainboard" },
    ],
    now,
  }).deck;
  await createEditableDeckIfAbsentV1(deck);

  const job = createSolDirectedBuildJobV111({
    storeId: "s1",
    storeSlug: "shop",
    userId: "c1",
    commanderOracleId: "cmd",
    commanderName: "Commander",
    userInputs: { ...base, mode: "review", importedCards: [], sourceDeckId: deck.deckId },
  });
  await recordProfessorReviewV1({
    deckId: deck.deckId,
    review: { buildId: job.buildId, status: "running", atRevision: deck.revision, requestedAt: now },
  });

  const result = {
    buildId: job.buildId,
    status: "COMPLETE",
    headProfessor: { grade: "B+" },
    validation: { pass: true },
    proofChain: null,
    telemetry: null,
    failureCode: null,
    failureMessage: null,
    suggestedSwaps: [{ cut: "Old Card", add: "New Card", reason: "better" }],
  } as unknown as SolDirectedBuildResultV111;
  await saveSolDirectedBuildResultV111({ job, result });

  const reviewed = await getEditableDeckV1(deck.deckId);
  assert.equal(reviewed?.professorReview?.status, "complete");
  assert.equal(reviewed?.professorReview?.grade, "B+");
  assert.equal(reviewed?.professorReview?.atRevision, deck.revision);
  assert.equal(reviewed?.revision, deck.revision, "a review must not count as an edit");

  // An older job finishing late must not replace a newer review.
  await recordProfessorReviewV1({
    deckId: deck.deckId,
    review: { buildId: "newer", status: "running", atRevision: deck.revision, requestedAt: now },
  });
  await saveSolDirectedBuildResultV111({ job, result });
  assert.equal((await getEditableDeckV1(deck.deckId))?.professorReview?.buildId, "newer");

  const list = mergeCustomerDeckListV1({ editableDecks: [reviewed!], savedDecks: [] });
  assert.equal(list.length, 1, "a review must not add a Professor build to My decks");
  assert.equal(list[0]!.grade, "B+");

  const swapped = applyDeckEditOpsV1({
    deck: reviewed!,
    ops: [
      { op: "moveCard", cardKey: reviewed!.cards.find((c) => c.name === "Old Card")!.cardKey, board: "cut" },
      { op: "addCard", oracleId: "c", name: "New Card", board: "mainboard" },
    ],
    now,
  });
  assert.equal(swapped.rejected.length, 0);
  const main = swapped.deck.cards.filter((c) => c.board === "mainboard").map((c) => c.name).sort();
  assert.deepEqual(main, ["New Card", "Other Card"]);
  assert.equal(swapped.deck.cards.find((c) => c.name === "Old Card")?.board, "cut");

  console.log("deck review: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
