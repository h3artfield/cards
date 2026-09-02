import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COS_V1_MIN_COMMANDER_UNIQUE } from "./constants";
import { scoreFromHeadlineVector } from "./score";
import type { CosV1AccessFeatures, CosV1ArchitectureFingerprint, CosV1Model, CosV1Reference } from "./types";
import {
  commanderBlendWeight,
  commanderReferenceDepth,
  mainboardCopies,
} from "./universal-coverage";

assert.equal(mainboardCopies([{ quantity: 29 }, { quantity: 1 }, { quantity: 1 }]), 31);
assert.equal(mainboardCopies(Array.from({ length: 71 }, () => ({ quantity: 1 }))), 71);
assert.ok(mainboardCopies([{ quantity: 29 }, ...Array.from({ length: 71 }, () => ({ quantity: 1 }))]) >= 90);

assert.equal(commanderBlendWeight(0), 0);
assert.equal(commanderBlendWeight(15), 0.5);
assert.equal(commanderBlendWeight(30), 1);
assert.equal(commanderBlendWeight(80), 1);

assert.equal(commanderReferenceDepth({ commanderKnown: true, nUnique: 40 }), "STRONG");
assert.equal(commanderReferenceDepth({ commanderKnown: true, nUnique: 15 }), "MODERATE");
assert.equal(commanderReferenceDepth({ commanderKnown: true, nUnique: 3 }), "LIMITED");
assert.equal(commanderReferenceDepth({ commanderKnown: false, nUnique: 0 }), "NEW_COMMANDER");

const COS = resolve(process.cwd(), "data/milestones/mechanical-space/commander-optimization-score-v1");
const model = JSON.parse(readFileSync(resolve(COS, "MODEL.json"), "utf8")) as CosV1Model;
const reference = JSON.parse(readFileSync(resolve(COS, "REFERENCE.json"), "utf8")) as CosV1Reference;
const fixtures = JSON.parse(readFileSync(resolve(COS, "GOLDEN_FIXTURES.json"), "utf8")) as {
  decks: Array<{ commanderIdentity: string; x: number[] }>;
};

const dummyAccess: CosV1AccessFeatures = {
  meanMvNonland: 0,
  fracMvLe2: 0,
  landFrac: 0,
  instantSorceryFrac: 0,
  tutorFrac: 0,
  drawFrac: 0,
  rampFrac: 0,
  interactFrac: 0,
  protectFrac: 0,
  recurFrac: 0,
  roleCompressFrac: 0,
  clusterEntropy: 0,
  sharedConc: 0,
};
const dummyArch: CosV1ArchitectureFingerprint = {
  nNormalizedCombos: 0,
  nNativeVariants: 0,
  minComboCardCount: null,
  nTwoCard: 0,
  nThreeCard: 0,
  nFourPlusCard: 0,
  nCommanderInvolved: 0,
  fractionCommanderInvolved: 0,
  commanderDependence: "NONE",
  terminalBuckets: [],
  enablingBuckets: [],
  nTerminalRoutes: 0,
  nResourceOnlyLoops: 0,
  nCardsInMultipleComboSets: 0,
  sharedPieceConcentration: 0,
  nCombosWithPrereqOrTemplate: 0,
  nCombosWithManaNeeded: 0,
  zoneProfile: {},
  hasTerminal: false,
};

const hashes = {
  formula: "10c4e3ab09d393a98b7921343379c6cc436fed30d01189e805ba98dc1d79882f",
  schema: "76f24597ed59578b1d8b8e941cdd896b58deb3c633f668c99e8e63fbbe28490c",
  model: "5f51e063a848508a1663201cbc7b8d3539872bd37ff8115fc8ed82d86343c9a9",
  reference: "b728a42fe81de3ab0abb7488761c95f460a0d0c48cf4d29b144a7f12b4b7d8ab",
};

const x = fixtures.decks[0]!.x;
const commanders = Object.entries(reference.commanders);
let strong = 0;
let moderate = 0;
let limited = 0;
for (const [ident, cmd] of commanders) {
  const scored = scoreFromHeadlineVector({
    x,
    commanderIdentity: ident,
    model,
    reference,
    access: dummyAccess,
    architecture: dummyArch,
    hashes,
  });
  assert.equal(scored.failure, null, ident);
  assert.ok(scored.competitiveStrength != null, `${ident} CS`);
  assert.ok(scored.buildOptimization != null, `${ident} BO`);
  assert.equal(scored.profile.length, 10, `${ident} profile`);
  if (cmd.nUnique >= COS_V1_MIN_COMMANDER_UNIQUE) {
    assert.equal(scored.buildOptimizationReferenceDepth, "STRONG");
    strong += 1;
  } else if (cmd.nUnique >= 10) {
    assert.equal(scored.buildOptimizationReferenceDepth, "MODERATE");
    moderate += 1;
  } else {
    assert.equal(scored.buildOptimizationReferenceDepth, "LIMITED");
    limited += 1;
  }
}

console.log(
  `COS universal coverage selftest passed: ${commanders.length} REFERENCE commanders (${strong} strong, ${moderate} moderate, ${limited} limited)`,
);
