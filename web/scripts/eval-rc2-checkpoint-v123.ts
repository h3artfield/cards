/**
 * RC2 v1.23 structural rerun — dev v26, expansion v2, per-family FP accounting.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import {
  classifyUnmatchedAction,
} from "./oracle-action-eval-shared";
import {
  countParserFalsePositives,
  evaluateCaseUnified,
  matchGoldToActions,
} from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

const FAMILY_CASES: Record<string, string[]> = {
  planeswalker: ["dev-exp-v1-038", "dev-exp-v1-039"],
  saga: ["dev-exp-v1-003"],
  clauseBoundary: ["dev-exp-v1-034", "dev-exp-v1-035"],
  modal: ["dev-exp-v1-010", "dev-exp-v1-013"],
  evaluatorMatcher: ["dev-exp-v1-001", "dev-exp-v1-002"],
  peerDerivedQuantity: ["dev-exp-v1-047"],
  blurCoreference: ["dev-exp-v1-005"],
};

function metrics(cases: OracleActionEvalCaseV2[], label: string) {
  const r = evaluateCaseSet(cases, label);
  const a = r.metricsByEmissionTier.acceptedOnly;
  return {
    caseCount: cases.length,
    accepted: {
      tp: a.truePositives,
      fp: a.falsePositives,
      fn: a.falseNegatives,
      precision: a.precision,
      recall: a.recall,
      unsupported: r.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
  };
}

function familyFp(cases: OracleActionEvalCaseV2[], caseIds: string[]) {
  const selected = cases.filter((c) => caseIds.includes(c.id));
  let fp = 0;
  for (const testCase of selected) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const unified = evaluateCaseUnified(
      testCase,
      raw.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart,
        evidenceEnd: a.evidenceEnd,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        sagaChapterId: a.sagaChapterId,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
        optionalCost: a.optionalCost,
      })),
    );
    fp += unified.accepted.fp;
  }
  return fp;
}

function countRemainingParserFp(cases: OracleActionEvalCaseV2[]) {
  let remaining = 0;
  const byFamily: Record<string, number> = {};
  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      loyaltyCost: a.loyaltyCost,
      sagaChapterId: a.sagaChapterId,
      modalOptionId: a.modalOptionId,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
    }));
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });
    remaining += countParserFalsePositives(testCase, matched.unmatchedActionIndices, actions);
    const family = (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata?.family ?? "other";
    for (const idx of matched.unmatchedActionIndices) {
      const action = actions[idx];
      const cat = classifyUnmatchedAction({
        testCase,
        primitive: action.primitive,
        evidenceText: action.evidenceText,
        evidenceStart: action.evidenceStart,
        evidenceEnd: action.evidenceEnd,
        cardFaceId: action.cardFaceId,
        abilityIndex: action.abilityIndex,
      });
      if (cat === "parser_false_positive") {
        byFamily[family] = (byFamily[family] ?? 0) + 1;
      }
    }
  }
  return { remaining, byFamily };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification: string;
  };
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string; setClassification: string };
  const training = exp.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combined = [...dev.cases, ...training];

  const v122Baseline = {
    planeswalker: 4,
    saga: 4,
    clauseBoundary: 2,
    modal: 0,
    evaluatorMatcher: 0,
    originalDevelopment: { p: 0.994, r: 0.917, unsupported: 0 },
    expansionTraining: { p: 0.797, r: 0.864, unsupported: 0 },
    combined: { p: 0.964, r: 0.91, unsupported: 0 },
  };

  const devMetrics = metrics(dev.cases, "development_set_v26");
  const expMetrics = metrics(training, "expansion_training_v2");
  const combinedMetrics = metrics(combined, "combined_development_v26_v2");
  const parserFp = countRemainingParserFp(training);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    perFamilyAcceptedFp: {
      planeswalker: { before: v122Baseline.planeswalker, after: familyFp(training, FAMILY_CASES.planeswalker) },
      saga: { before: v122Baseline.saga, after: familyFp(training, FAMILY_CASES.saga) },
      clauseBoundary: { before: v122Baseline.clauseBoundary, after: familyFp(training, FAMILY_CASES.clauseBoundary) },
      modal: { before: v122Baseline.modal, after: familyFp(training, FAMILY_CASES.modal) },
      evaluatorMatcher: {
        before: v122Baseline.evaluatorMatcher,
        after: familyFp(training, FAMILY_CASES.evaluatorMatcher),
      },
    },
    metrics: {
      originalDevelopmentV26: devMetrics,
      expansionTraining: expMetrics,
      combinedDevelopment: combinedMetrics,
    },
    trueParserFpRemaining: parserFp.remaining,
    fnRemainingByFamily: {},
    regressionInvariants: {
      unsupported: devMetrics.accepted.unsupported === 0 && expMetrics.accepted.unsupported === 0,
      evaluatorDefects: familyFp(training, FAMILY_CASES.evaluatorMatcher) === 0,
    },
    gates: {
      combinedPrecisionTarget: combinedMetrics.accepted.precision >= 0.98,
      combinedRecallTarget: combinedMetrics.accepted.recall >= 0.9,
      expansionPrecisionPreferred: expMetrics.accepted.precision >= 0.9,
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc2-checkpoint-v123-canonical.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
