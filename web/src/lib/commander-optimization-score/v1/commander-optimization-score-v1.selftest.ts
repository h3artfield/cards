import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { COS_V1_EXPECTED_SHA } from "./constants";
import { percentileFromGrid } from "./percentile";
import { buildCosV1PlayerReport } from "./player-report";
import { commanderIdentity, scoreFromHeadlineVector } from "./score";
import type { CosV1AccessFeatures, CosV1ArchitectureFingerprint, CosV1Model, CosV1Reference } from "./types";

const COS = resolve(process.cwd(), "data/milestones/mechanical-space/commander-optimization-score-v1");

function sha(name: string): string {
  return createHash("sha256").update(readFileSync(resolve(COS, name))).digest("hex");
}

const hashes = {
  formula: sha("FORMULA.json"),
  schema: sha("SCHEMA.json"),
  model: sha("MODEL.json"),
  reference: sha("REFERENCE.json"),
};
assert.equal(hashes.formula, COS_V1_EXPECTED_SHA.formula);
assert.equal(hashes.schema, COS_V1_EXPECTED_SHA.schema);
assert.equal(hashes.model, COS_V1_EXPECTED_SHA.model);
assert.equal(hashes.reference, COS_V1_EXPECTED_SHA.reference);

const fixtures = JSON.parse(readFileSync(resolve(COS, "GOLDEN_FIXTURES.json"), "utf8")) as {
  interpolation: { cases: Array<{ value: number; result: number }> };
  decks: Array<{
    id: string;
    commanderIdentity: string;
    x: number[];
    R: number;
    U: number;
    competitiveStrength: number;
    buildOptimization: number | null;
  }>;
};
const model = JSON.parse(readFileSync(resolve(COS, "MODEL.json"), "utf8")) as CosV1Model;
const reference = JSON.parse(readFileSync(resolve(COS, "REFERENCE.json"), "utf8")) as CosV1Reference;

for (const c of fixtures.interpolation.cases) {
  const got = percentileFromGrid(c.value, reference.globalUtilityQuantiles);
  assert.ok(Math.abs(got - c.result) < 1e-9, `interp ${c.value}: ${got} != ${c.result}`);
}

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
  nNormalizedCombos: 1,
  nNativeVariants: 1,
  minComboCardCount: 2,
  nTwoCard: 1,
  nThreeCard: 0,
  nFourPlusCard: 0,
  nCommanderInvolved: 0,
  fractionCommanderInvolved: 0,
  commanderDependence: "COMMANDER_INDEPENDENT",
  terminalBuckets: ["WIN_THE_GAME"],
  enablingBuckets: [],
  nTerminalRoutes: 1,
  nResourceOnlyLoops: 0,
  nCardsInMultipleComboSets: 0,
  sharedPieceConcentration: 0,
  nCombosWithPrereqOrTemplate: 0,
  nCombosWithManaNeeded: 0,
  zoneProfile: {},
  hasTerminal: true,
};

let firstScored: ReturnType<typeof scoreFromHeadlineVector> | null = null;
for (const deck of fixtures.decks) {
  const scored = scoreFromHeadlineVector({
    x: deck.x,
    commanderIdentity: deck.commanderIdentity,
    model,
    reference,
    access: dummyAccess,
    architecture: dummyArch,
    hashes,
  });
  assert.equal(scored.failure, null);
  assert.equal(scored.COLOR_USED, false);
  assert.equal(scored.OPPONENT_FEATURES_USED, false);
  assert.equal(scored.PROFILE_AVERAGED_INTO_HEADLINE, false);
  assert.equal(scored.COS_V1_MATH_CHANGED, false);
  assert.equal(scored.commanderBaselineStatus, "CALIBRATED");
  assert.ok(Math.abs((scored.residual ?? 0) - deck.R) < 1e-9, `${deck.id} R`);
  assert.ok(Math.abs((scored.utility ?? 0) - deck.U) < 1e-9, `${deck.id} U`);
  assert.ok(Math.abs((scored.competitiveStrength ?? 0) - deck.competitiveStrength) < 1e-9, `${deck.id} CS`);
  if (deck.buildOptimization == null) {
    assert.ok(scored.buildOptimization != null, `${deck.id} BO coverage`);
  } else {
    assert.ok(Math.abs((scored.buildOptimization ?? 0) - deck.buildOptimization) < 1e-9, `${deck.id} BO`);
    assert.equal(scored.buildOptimizationStatus, "ok");
    assert.equal(scored.buildOptimizationReferenceDepth, "STRONG");
  }
  assert.equal(scored.coverageLineage, "COS_V1_UNIVERSAL_COVERAGE_V1");
  assert.equal(scored.profile.length, 10);
  const scoredAgain = scoreFromHeadlineVector({
    x: deck.x,
    commanderIdentity: deck.commanderIdentity,
    model,
    reference,
    access: dummyAccess,
    architecture: dummyArch,
    hashes,
  });
  assert.equal(scored.competitiveStrength, scoredAgain.competitiveStrength, `${deck.id} CS determinism`);
  assert.equal(scored.buildOptimization, scoredAgain.buildOptimization, `${deck.id} BO determinism`);
  firstScored ??= scored;
}

const uncalibrated = scoreFromHeadlineVector({
  x: fixtures.decks[0]!.x,
  commanderIdentity: "unseen-commander-identity-not-in-model",
  model,
  reference,
  access: dummyAccess,
  architecture: dummyArch,
  hashes,
});
assert.equal(uncalibrated.failure, null);
assert.equal(uncalibrated.commanderKnown, false);
assert.equal(uncalibrated.unknownCommander, true);
assert.equal(uncalibrated.commanderBaselineStatus, "COMMANDER_BASELINE_UNCALIBRATED");
assert.ok(uncalibrated.buildOptimization != null, "unknown commander still maps BO on the global residual mixture");
assert.equal(uncalibrated.buildOptimizationStatus, "unknown_commander");
assert.equal(uncalibrated.buildOptimizationReferenceDepth, "NEW_COMMANDER");
assert.equal(uncalibrated.profile.length, 10);
assert.equal(
  uncalibrated.competitiveStrength,
  null,
  "unseen commander must not publish S=0 on the global U grid as Competitive Strength",
);

assert.equal(commanderIdentity(["b", "a", "a"]), "a|b");

assert.ok(firstScored);
const report = buildCosV1PlayerReport({
  score: firstScored,
  architecture: dummyArch,
  hits: [{ cardSetSignature: "aaa|bbb", commanderInvolved: false }],
  comboIndex: new Map([
    [
      "aaa|bbb",
      {
        cardSetSignature: "aaa|bbb",
        comboCardCount: 2,
        terminalFeatureIds: [],
        enablingFeatureIds: [],
        terminalBuckets: ["WIN_THE_GAME"],
        enablingBuckets: [],
        isTerminalRoute: true,
        isResourceOnlyLoop: false,
        nTemplates: 0,
        manaNeededValues: [],
        manaValueNeeded: [],
        zoneLocations: {},
        hasEasyPrereq: false,
        hasNotablePrereq: false,
      },
    ],
  ]),
  names: new Map([
    ["aaa", "Thassa's Oracle"],
    ["bbb", "Demonic Consultation"],
  ]),
});
const reportText = JSON.stringify(report);
assert.match(report.competitiveStrengthBlurb, /not an expected win rate/i);
assert.match(report.buildOptimizationBlurb, /not an expected win percentile/i);
assert.doesNotMatch(reportText, /contributes \d/i);
assert.ok(report.profile.some((a) => a.band === "Strength drivers"));
assert.ok(report.profile.some((a) => a.band === "Deck characteristics"));
assert.ok(report.whyTheScore.some((line) => /not additive/i.test(line)));
assert.equal(report.knownCombos[0]?.pieces.join(" + "), "Thassa's Oracle + Demonic Consultation");
assert.equal(report.winConditions[0]?.rank, "Primary");

console.log("COS v1 golden math fixtures passed", fixtures.decks.map((d) => d.id).join(", "));
