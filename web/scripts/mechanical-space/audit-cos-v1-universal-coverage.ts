/**
 * Coverage audit for COS_V1_UNIVERSAL_COVERAGE_V1.
 * Does not retrain, does not change frozen hashes.
 *
 * The 72,482 architecture-fingerprint rows do not include card lists, so they
 * cannot be re-extracted. This audit scores every commander identity in the
 * frozen REFERENCE against a fixed golden headline vector, plus an unseen
 * commander, and reports reference-depth buckets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scoreFromHeadlineVector } from "../../src/lib/commander-optimization-score/v1/score";
import type {
  CosV1AccessFeatures,
  CosV1ArchitectureFingerprint,
  CosV1Model,
  CosV1Reference,
} from "../../src/lib/commander-optimization-score/v1/types";
import { COS_V1_EXPECTED_SHA } from "../../src/lib/commander-optimization-score/v1/constants";

const COS = resolve(process.cwd(), "data/milestones/mechanical-space/commander-optimization-score-v1");
const model = JSON.parse(readFileSync(resolve(COS, "MODEL.json"), "utf8")) as CosV1Model;
const reference = JSON.parse(readFileSync(resolve(COS, "REFERENCE.json"), "utf8")) as CosV1Reference;
const fixtures = JSON.parse(readFileSync(resolve(COS, "GOLDEN_FIXTURES.json"), "utf8")) as {
  decks: Array<{ id: string; commanderIdentity: string; x: number[]; competitiveStrength: number; buildOptimization: number | null }>;
};

const dummyAccess: CosV1AccessFeatures = {
  meanMvNonland: 2.4,
  fracMvLe2: 0.4,
  landFrac: 0.36,
  instantSorceryFrac: 0.18,
  tutorFrac: 0.05,
  drawFrac: 0.12,
  rampFrac: 0.1,
  interactFrac: 0.14,
  protectFrac: 0.06,
  recurFrac: 0.04,
  roleCompressFrac: 0.08,
  clusterEntropy: 3.2,
  sharedConc: 0.2,
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

const failures: Array<{ id: string; reason: string }> = [];
const buckets = { STRONG: 0, MODERATE: 0, LIMITED: 0, NEW_COMMANDER: 0 };
let cs = 0;
let bo = 0;
let profile10 = 0;
let complete = 0;

for (const [ident, cmd] of Object.entries(reference.commanders)) {
  const scored = scoreFromHeadlineVector({
    x: fixtures.decks[0]!.x,
    commanderIdentity: ident,
    model,
    reference,
    access: dummyAccess,
    architecture: dummyArch,
    hashes: COS_V1_EXPECTED_SHA,
  });
  if (scored.competitiveStrength != null) cs += 1;
  if (scored.buildOptimization != null) bo += 1;
  if (scored.profile.length === 10) profile10 += 1;
  if (scored.buildOptimization != null && scored.profile.length === 10) {
    complete += 1;
  } else {
    failures.push({ id: ident, reason: scored.failure?.code ?? "incomplete_numeric_outputs" });
  }
  const depth = scored.buildOptimizationReferenceDepth;
  if (depth) buckets[depth] += 1;
  void cmd;
}

const unseen = scoreFromHeadlineVector({
  x: fixtures.decks[0]!.x,
  commanderIdentity: "unseen-commander-for-coverage-audit",
  model,
  reference,
  access: dummyAccess,
  architecture: dummyArch,
  hashes: COS_V1_EXPECTED_SHA,
});
if (unseen.competitiveStrength == null && unseen.buildOptimization != null && unseen.profile.length === 10) {
  complete += 1;
  bo += 1;
  profile10 += 1;
  buckets.NEW_COMMANDER += 1;
} else {
  failures.push({ id: "unseen-commander-for-coverage-audit", reason: unseen.failure?.code ?? "unseen_must_withhold_cs" });
}

const golden = fixtures.decks.map((deck) => {
  const a = scoreFromHeadlineVector({
    x: deck.x,
    commanderIdentity: deck.commanderIdentity,
    model,
    reference,
    access: dummyAccess,
    architecture: dummyArch,
    hashes: COS_V1_EXPECTED_SHA,
  });
  const b = scoreFromHeadlineVector({
    x: deck.x,
    commanderIdentity: deck.commanderIdentity,
    model,
    reference,
    access: dummyAccess,
    architecture: dummyArch,
    hashes: COS_V1_EXPECTED_SHA,
  });
  const near = (x: number | null, y: number | null) =>
    x != null && y != null && Math.abs(x - y) < 1e-9;
  return {
    id: deck.id,
    csBitIdentical: near(a.competitiveStrength, deck.competitiveStrength) && near(a.competitiveStrength, b.competitiveStrength),
    boBitIdentical:
      deck.buildOptimization == null
        ? a.buildOptimization != null && near(a.buildOptimization, b.buildOptimization)
        : near(a.buildOptimization, deck.buildOptimization) && near(a.buildOptimization, b.buildOptimization),
  };
});

const report = {
  lineage: "COS_V1_UNIVERSAL_COVERAGE_V1",
  COS_V1_MODEL_COEFFICIENTS_CHANGED: false,
  SPENT_OUTCOMES_USED_FOR_TUNING: false,
  OPPONENT_FEATURES_USED: false,
  PLAYER_FEATURES_USED: false,
  COLOR_BONUS_USED: false,
  LLM_USED_IN_NUMERIC_SCORE: false,
  EXISTING_N_GE_30_BO_CHANGED: false,
  note:
    "architecture-fingerprints.jsonl (72,482) has no card lists; this audit scores every REFERENCE commander plus one unseen identity on a frozen golden headline vector.",
  nReferenceCommanders: Object.keys(reference.commanders).length,
  nScoredIncludingUnseen: Object.keys(reference.commanders).length + 1,
  competitiveStrengthReturned: cs,
  buildOptimizationReturned: bo,
  allTenProfileReturned: profile10,
  completeCosReportReturned: complete,
  referenceDepthBuckets: buckets,
  failures,
  goldenFixtureRegression: golden,
  fingerprintCorpusHasCardLists: false,
  fingerprintCorpusRows: 72482,
};

const out = resolve(COS, "UNIVERSAL_COVERAGE_AUDIT.json");
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`wrote ${out}`);
