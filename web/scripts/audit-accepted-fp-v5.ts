/**
 * Audit accepted-only false positives on development_set_v5.
 * Run: npx tsx scripts/audit-accepted-fp-v5.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";

export type AcceptedFpCategory =
  | "genuinely_unsupported"
  | "wrong_primitive"
  | "duplicate"
  | "wrong_ability"
  | "wrong_face"
  | "wrong_zone"
  | "wrong_condition_or_optionality"
  | "missing_gold_label"
  | "evaluator_defect";

function classifyAcceptedFp(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string;
  evidenceText: string;
  cardFaceId: string;
  abilityIndex: number;
  allAccepted: Array<{ primitive: string | null; evidenceText: string; cardFaceId: string; abilityIndex: number }>;
  actionIndex: number;
}): AcceptedFpCategory {
  const { testCase, primitive, evidenceText, cardFaceId, allAccepted, actionIndex } = input;

  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidenceText);
  if (!supported) return "genuinely_unsupported";

  const duplicate = allAccepted.some(
    (o, oi) =>
      oi !== actionIndex &&
      o.primitive === primitive &&
      o.abilityIndex === input.abilityIndex &&
      o.evidenceText.length > evidenceText.length &&
      evidenceMatchesExtracted(o.evidenceText, evidenceText.slice(0, Math.min(20, evidenceText.length))),
  );
  if (duplicate) return "duplicate";

  const goldSameEvidence = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      evidenceMatchesExtracted(evidenceText, e.evidenceContains) &&
      e.actionType !== primitive,
  );
  if (goldSameEvidence) return "wrong_primitive";

  const goldOtherFace = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.actionType === primitive &&
      e.cardFace &&
      e.cardFace !== cardFaceId &&
      evidenceMatchesExtracted(evidenceText, e.evidenceContains),
  );
  if (goldOtherFace) return "wrong_face";

  if (testCase.cardFace && cardFaceId !== testCase.cardFace) return "wrong_face";

  const looseGold = testCase.expectedPrimitiveActions.find(
    (e) => !e.negative && e.actionType === primitive && evidenceMatchesOracle(testCase.oracleText, evidenceText),
  );
  if (looseGold && !evidenceMatchesExtracted(evidenceText, looseGold.evidenceContains)) {
    return "wrong_ability";
  }

  if (
    looseGold &&
    (looseGold.optional !== undefined ||
      looseGold.optionalEffect !== undefined ||
      looseGold.optionalCost !== undefined)
  ) {
    return "wrong_condition_or_optionality";
  }

  if (supported === primitive && evidenceMatchesOracle(testCase.oracleText, evidenceText)) {
    return "missing_gold_label";
  }

  if (testCase.expectedPrimitiveActions.some((e) => !e.negative && e.actionType === primitive)) {
    return "evaluator_defect";
  }

  return "genuinely_unsupported";
}

function runAcceptedFpAudit(cases: OracleActionEvalCaseV2[]) {
  let acceptedTp = 0;
  let acceptedFp = 0;
  let acceptedFn = 0;
  let needsReviewTp = 0;
  let needsReviewFp = 0;
  let needsReviewFn = 0;
  let abstainedExpectedAction = 0;

  const acceptedFps: Array<{
    caseId: string;
    oracleId: string;
    cardFace: string;
    evidenceText: string;
    emittedAction: string;
    expectedResult: string;
    category: AcceptedFpCategory;
    proposedFix: string;
  }> = [];

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    const accepted = raw.actions
      .filter((a) => a.reviewStatus === "accepted")
      .map((a) => ({
        primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
        evidenceText: a.evidenceText,
        cardFaceId: a.faceId,
        abilityIndex: a.abilityIndex,
        actionType: a.actionType,
        reviewStatus: a.reviewStatus,
      }));

    const needsReview = raw.actions
      .filter((a) => a.reviewStatus === "needs_review")
      .map((a) => ({
        primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
        evidenceText: a.evidenceText,
        cardFaceId: a.faceId,
        abilityIndex: a.abilityIndex,
      }));

    const matchedAccepted = new Set<number>();
    const matchedNeedsReview = new Set<number>();

    for (const exp of expected) {
      const aIdx = accepted.findIndex(
        (a, i) =>
          !matchedAccepted.has(i) &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      if (aIdx >= 0) {
        acceptedTp += 1;
        matchedAccepted.add(aIdx);
        continue;
      }

      const nrIdx = needsReview.findIndex(
        (a, i) =>
          !matchedNeedsReview.has(i) &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      if (nrIdx >= 0) {
        needsReviewTp += 1;
        matchedNeedsReview.add(nrIdx);
        acceptedFn += 1;
        continue;
      }

      acceptedFn += 1;
      const couldExtract = raw.actions.some(
        (a) =>
          normalizeToPrimitive(a.actionType, a.evidenceText) === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
      );
      if (!couldExtract) abstainedExpectedAction += 1;
    }

    for (let i = 0; i < accepted.length; i++) {
      if (matchedAccepted.has(i)) continue;
      const a = accepted[i];
      if (!a.primitive) continue;
      acceptedFp += 1;
      const category = classifyAcceptedFp({
        testCase,
        primitive: a.primitive,
        evidenceText: a.evidenceText,
        cardFaceId: a.cardFaceId,
        abilityIndex: a.abilityIndex,
        allAccepted: accepted,
        actionIndex: i,
      });
      const goldMatch = expected.find(
        (e) => e.actionType === a.primitive && evidenceMatchesExtracted(a.evidenceText, e.evidenceContains),
      );
      acceptedFps.push({
        caseId: testCase.id,
        oracleId: testCase.oracleId,
        cardFace: a.cardFaceId,
        evidenceText: a.evidenceText,
        emittedAction: a.primitive,
        expectedResult: goldMatch
          ? `gold: ${goldMatch.actionType} (${goldMatch.evidenceContains})`
          : "no matching gold label",
        category,
        proposedFix:
          category === "missing_gold_label"
            ? "Add gold label or confirm abstention"
            : category === "wrong_primitive"
              ? "Fix primitive pattern or gold type"
              : category === "duplicate"
                ? "Improve dedupe within ability"
                : category === "wrong_ability"
                  ? "Tighten evidence span to correct clause"
                  : category === "wrong_face"
                    ? "Fix face attachment"
                    : "Parser or gold correction",
      });
    }

    for (let i = 0; i < needsReview.length; i++) {
      if (matchedNeedsReview.has(i)) continue;
      if (needsReview[i].primitive) needsReviewFp += 1;
    }
  }

  const acceptedPrecision = acceptedTp + acceptedFp > 0 ? acceptedTp / (acceptedTp + acceptedFp) : 1;
  const acceptedRecall = acceptedTp + acceptedFn > 0 ? acceptedTp / (acceptedTp + acceptedFn) : 1;
  const acceptedFpr = acceptedTp + acceptedFp > 0 ? acceptedFp / (acceptedTp + acceptedFp) : 0;

  return {
    accepted: {
      truePositives: acceptedTp,
      falsePositives: acceptedFp,
      falseNegatives: acceptedFn,
      precision: acceptedPrecision,
      recall: acceptedRecall,
      falsePositiveRate: acceptedFpr,
    },
    needsReview: {
      truePositives: needsReviewTp,
      falsePositives: needsReviewFp,
      falseNegatives: needsReviewFn,
    },
    abstainedExpectedActionCount: abstainedExpectedAction,
    acceptedFalsePositives: acceptedFps,
    categoryCounts: acceptedFps.reduce(
      (acc, fp) => {
        acc[fp.category] = (acc[fp.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<AcceptedFpCategory, number>,
    ),
  };
}

function main() {
  const dev = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const report = runAcceptedFpAudit(dev.cases);
  const outDir = resolve(process.cwd(), "reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "oracle-action-accepted-fp-audit-v5.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Accepted metrics:", report.accepted);
  console.log("Needs-review metrics:", report.needsReview);
  console.log("Abstained expected actions:", report.abstainedExpectedActionCount);
  console.log("Accepted FP count:", report.acceptedFalsePositives.length);
  console.log("Categories:", report.categoryCounts);
  console.log("→", outPath);
}

export { runAcceptedFpAudit };

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("audit-accepted-fp-v5.ts");
if (isDirectRun) {
  main();
}
