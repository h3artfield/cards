/**
 * Oracle-action evaluation v8 — multiface face metrics, layout matrix, mutually exclusive FP taxonomy.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v8.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ORACLE_ACTION_PARSER_VERSION,
  type CardFaceComponentType,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import {
  evidenceCrossesFaceBoundary,
  faceForEvidenceSpan,
  segmentCardFaces,
} from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { ExpectedFace, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  computeMetrics,
  evaluateCaseSet,
  type AuthoritativeOutcome,
} from "./eval-oracle-action-extraction-v6";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";

/** Mutually exclusive false-positive / unmatched extraction category (one per extraction). */
export type ExclusiveUnmatchedCategory =
  | "genuinely_unsupported"
  | "wrong_primitive"
  | "wrong_face"
  | "wrong_ability"
  | "duplicate"
  | "missing_gold_label"
  | "structure_or_attachment_error"
  | "evaluator_defect";

const MULTIFACE_LAYOUTS = ["split", "aftermath", "adventure", "mdfc", "transform", "room"] as const;

function isMultifaceCase(c: OracleActionEvalCaseV2): boolean {
  return Boolean(c.layout && MULTIFACE_LAYOUTS.includes(c.layout as (typeof MULTIFACE_LAYOUTS)[number]));
}

function normalizeFaceId(faceId: string): "front" | "back" {
  if (faceId === "back" || faceId === "right" || faceId === "aftermath") return "back";
  return "front";
}

function classifyExclusiveUnmatched(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string | null;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardFaceId: string;
  abilityIndex: number;
  allActions: Array<{ primitive: string | null; evidenceText: string; cardFaceId: string; abilityIndex: number }>;
  matchedExpectedIndices: Set<number>;
}): ExclusiveUnmatchedCategory {
  const { testCase, primitive, evidenceText, evidenceStart, evidenceEnd, cardFaceId, abilityIndex, allActions } =
    input;

  if (!spanValid(testCase.oracleText, evidenceText, evidenceStart, evidenceEnd)) {
    return "genuinely_unsupported";
  }

  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidenceText);
  if (!supported) return "genuinely_unsupported";

  if (primitive !== supported) return "wrong_primitive";

  const goldOnOtherFace = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.actionType === primitive &&
      e.cardFace &&
      e.cardFace !== cardFaceId &&
      evidenceMatchesExtracted(evidenceText, e.evidenceContains),
  );
  if (goldOnOtherFace) return "wrong_face";

  if (testCase.cardFace && cardFaceId !== testCase.cardFace) return "wrong_face";

  const duplicate = allActions.some(
    (o, oi) =>
      oi !== allActions.findIndex((a) => a.evidenceText === evidenceText) &&
      o.primitive === primitive &&
      evidenceMatchesExtracted(o.evidenceText, evidenceText.slice(0, 20)),
  );
  if (duplicate) return "duplicate";

  const looseGold = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.actionType === primitive &&
      evidenceMatchesOracle(testCase.oracleText, evidenceText),
  );
  if (looseGold && !evidenceMatchesExtracted(evidenceText, looseGold.evidenceContains)) {
    return "wrong_ability";
  }

  if (looseGold) return "evaluator_defect";

  const wrongTypeSameEvidence = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      evidenceMatchesExtracted(evidenceText, e.evidenceContains) &&
      e.actionType !== primitive,
  );
  if (wrongTypeSameEvidence) return "structure_or_attachment_error";

  if (supported === primitive && evidenceMatchesOracle(testCase.oracleText, evidenceText)) {
    return "missing_gold_label";
  }

  return "wrong_ability";
}

function scoreFaceSegmentation(cases: OracleActionEvalCaseV2[]) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const componentTypeCorrect = { correct: 0, total: 0 };
  const faceNameCorrect = { correct: 0, total: 0 };
  const faceIndexCorrect = { correct: 0, total: 0 };
  const failures: Array<{ caseId: string; issue: string }> = [];

  for (const testCase of cases.filter((c) => c.expectedFaces?.length)) {
    const predicted = segmentCardFaces(testCase.oracleText);
    const expected = testCase.expectedFaces!;

    for (const exp of expected) {
      const match = predicted.find((p) => p.faceId === exp.faceId);
      if (!match) {
        fn += 1;
        failures.push({ caseId: testCase.id, issue: `missing face ${exp.faceId}` });
        continue;
      }
      tp += 1;
      componentTypeCorrect.total += 1;
      faceNameCorrect.total += 1;
      faceIndexCorrect.total += 1;
      if (match.componentType === exp.componentType) componentTypeCorrect.correct += 1;
      else failures.push({ caseId: testCase.id, issue: `componentType ${exp.faceId}: expected ${exp.componentType}, got ${match.componentType}` });
      if (match.faceName === exp.faceName) faceNameCorrect.correct += 1;
      if (match.faceIndex === exp.faceIndex) faceIndexCorrect.correct += 1;
    }

    for (const pred of predicted) {
      if (!expected.some((e) => e.faceId === pred.faceId)) {
        fp += 1;
        failures.push({ caseId: testCase.id, issue: `extra face ${pred.faceId}` });
      }
    }
  }

  const seg = computeMetrics(tp, fp, fn);
  return {
    precision: seg.precision,
    recall: seg.recall,
    componentTypeAccuracy: componentTypeCorrect.total
      ? componentTypeCorrect.correct / componentTypeCorrect.total
      : 1,
    faceNameAccuracy: faceNameCorrect.total ? faceNameCorrect.correct / faceNameCorrect.total : 1,
    faceIndexAccuracy: faceIndexCorrect.total ? faceIndexCorrect.correct / faceIndexCorrect.total : 1,
    failures,
  };
}

function scoreFaceAttachment(cases: OracleActionEvalCaseV2[]) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let wrongFaceLeakage = 0;
  let crossFaceSpans = 0;
  let evidenceSpanInvalid = 0;
  let cardFaceIdentityErrors = 0;
  const matrix = {
    expectedFrontPredictedFront: 0,
    expectedFrontPredictedBack: 0,
    expectedBackPredictedFront: 0,
    expectedBackPredictedBack: 0,
  };

  for (const testCase of cases.filter(isMultifaceCase)) {
    const faces = segmentCardFaces(testCase.oracleText);
    const raw = extractOracleActionsV1({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    const actions = raw.actions;

    for (const action of actions) {
      const spanOk = spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd);
      if (!spanOk) evidenceSpanInvalid += 1;

      if (evidenceCrossesFaceBoundary(faces, action.cardEvidenceStart, action.cardEvidenceEnd)) {
        crossFaceSpans += 1;
      }

      const containingFace = faceForEvidenceSpan(faces, action.cardEvidenceStart, action.cardEvidenceEnd);
      if (containingFace && action.faceId !== containingFace.faceId) {
        cardFaceIdentityErrors += 1;
      }

      if (action.oracleId !== testCase.oracleId) cardFaceIdentityErrors += 1;
    }

    const goldWithFace = testCase.expectedPrimitiveActions.filter((e) => !e.negative && e.cardFace);
    for (const exp of goldWithFace) {
      const match = actions.find(
        (a) =>
          normalizeToPrimitive(a.actionType, a.evidenceText) === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.faceId === exp.cardFace),
      );
      const expSide = normalizeFaceId(exp.cardFace!);
      if (match) {
        const predSide = normalizeFaceId(match.faceId);
        if (predSide === expSide) {
          tp += 1;
          if (expSide === "front") matrix.expectedFrontPredictedFront += 1;
          else matrix.expectedBackPredictedBack += 1;
        } else {
          fp += 1;
          wrongFaceLeakage += 1;
          if (expSide === "front") matrix.expectedFrontPredictedBack += 1;
          else matrix.expectedBackPredictedFront += 1;
        }
      } else {
        fn += 1;
      }
    }

    for (const action of actions) {
      const primitive = normalizeToPrimitive(action.actionType, action.evidenceText);
      const goldMatch = testCase.expectedPrimitiveActions.find(
        (e) =>
          !e.negative &&
          e.actionType === primitive &&
          evidenceMatchesExtracted(action.evidenceText, e.evidenceContains) &&
          (!e.cardFace || e.cardFace === action.faceId),
      );
      if (!goldMatch) continue;
      if (goldMatch.cardFace && goldMatch.cardFace !== action.faceId) {
        wrongFaceLeakage += 1;
      }
    }
  }

  const attach = computeMetrics(tp, fp, fn);
  return {
    actionToFaceAttachmentPrecision: attach.precision,
    actionToFaceAttachmentRecall: attach.recall,
    wrongFaceLeakageCount: wrongFaceLeakage,
    crossFaceEvidenceSpanCount: crossFaceSpans,
    evidenceSpanValidityRate:
      cases.filter(isMultifaceCase).length > 0
        ? 1 - evidenceSpanInvalid / Math.max(1, cases.filter(isMultifaceCase).flatMap((c) =>
            extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText }).actions,
          ).length)
        : 1,
    cardFaceIdentityAccuracy: cardFaceIdentityErrors === 0 ? 1 : 0,
    attachmentMatrix: matrix,
  };
}

function metricsByLayout(cases: OracleActionEvalCaseV2[]) {
  const byLayout: Record<
    string,
    {
      caseCount: number;
      allEmission: { precision: number; recall: number };
      acceptedOnly: { precision: number; recall: number };
      needsReviewCount: number;
      abstentionCount: number;
    }
  > = {};

  for (const layout of MULTIFACE_LAYOUTS) {
    const subset = cases.filter((c) => c.layout === layout);
    if (!subset.length) continue;
    const result = evaluateCaseSet(subset, `multiface_${layout}`);
    let needsReviewCount = 0;
    let abstentionCount = 0;
    for (const c of subset) {
      const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
      needsReviewCount += raw.actions.filter((a) => a.reviewStatus === "needs_review").length;
      abstentionCount += raw.abstainedClauses.length;
    }
    byLayout[layout] = {
      caseCount: subset.length,
      allEmission: {
        precision: result.metricsByEmissionTier.allEmission.precision,
        recall: result.metricsByEmissionTier.allEmission.recall,
      },
      acceptedOnly: {
        precision: result.metricsByEmissionTier.acceptedOnly.precision,
        recall: result.metricsByEmissionTier.acceptedOnly.recall,
      },
      needsReviewCount,
      abstentionCount,
    };
  }
  return byLayout;
}

function goldSupportByLayout(cases: OracleActionEvalCaseV2[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const layout of MULTIFACE_LAYOUTS) {
    counts[layout] = cases.filter((c) => c.layout === layout).length;
  }
  return counts;
}

function main() {
  const devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json");
  const dev = JSON.parse(readFileSync(devPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
  };

  const multifaceCases = dev.cases.filter(isMultifaceCase);
  const faceSegmentation = scoreFaceSegmentation(dev.cases);
  const faceAttachment = scoreFaceAttachment(dev.cases);
  const layoutSupport = goldSupportByLayout(dev.cases);
  const primitiveByLayout = metricsByLayout(dev.cases);

  const exclusiveUnmatched: Record<ExclusiveUnmatchedCategory, number> = {
    genuinely_unsupported: 0,
    wrong_primitive: 0,
    wrong_face: 0,
    wrong_ability: 0,
    duplicate: 0,
    missing_gold_label: 0,
    structure_or_attachment_error: 0,
    evaluator_defect: 0,
  };

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus,
    }));

    const matchedExpected = new Set<number>();
    for (let ei = 0; ei < testCase.expectedPrimitiveActions.length; ei++) {
      const exp = testCase.expectedPrimitiveActions[ei];
      if (exp.negative) continue;
      const hit = actions.find(
        (a) =>
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      if (hit) matchedExpected.add(ei);
    }

    for (const action of actions) {
      const matched = testCase.expectedPrimitiveActions.some(
        (exp, ei) =>
          !exp.negative &&
          matchedExpected.has(ei) &&
          exp.actionType === action.primitive &&
          evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains),
      );
      if (matched) continue;

      const category = classifyExclusiveUnmatched({
        testCase,
        primitive: action.primitive,
        evidenceText: action.evidenceText,
        evidenceStart: action.evidenceStart,
        evidenceEnd: action.evidenceEnd,
        cardFaceId: action.cardFaceId,
        abilityIndex: action.abilityIndex,
        allActions: actions,
        matchedExpectedIndices: matchedExpected,
      });
      exclusiveUnmatched[category] += 1;
    }
  }

  const gates = {
    cardFaceIdentity: faceAttachment.cardFaceIdentityAccuracy === 1,
    evidenceSpanValidity: faceAttachment.evidenceSpanValidityRate === 1,
    wrongFaceLeakageZero: faceAttachment.wrongFaceLeakageCount === 0,
    crossFaceSpansZero: faceAttachment.crossFaceEvidenceSpanCount === 0,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    developmentSet: "development_set_v4",
    developmentDatasetHash: dev.contentHash,
    caseCount: dev.caseCount,
    multifaceCaseCount: multifaceCases.length,
    goldSupportByLayout: layoutSupport,
    faceSegmentation: {
      precision: faceSegmentation.precision,
      recall: faceSegmentation.recall,
      componentTypeAccuracy: faceSegmentation.componentTypeAccuracy,
      faceNameAccuracy: faceSegmentation.faceNameAccuracy,
      faceIndexAccuracy: faceSegmentation.faceIndexAccuracy,
      failures: faceSegmentation.failures,
    },
    faceAttachment,
    developmentGates: gates,
    primitiveMetricsByLayout: primitiveByLayout,
    exclusiveUnmatchedCategories: exclusiveUnmatched,
    validationAccessed: false,
    finalBlindAccessed: false,
    note: "Development-only multiface slice. Validation and final blind not accessed.",
  };

  const outDir = resolve(process.cwd(), "reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "oracle-action-eval-development-v8-multiface.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Oracle-action eval v8 (multiface development slice)");
  console.log(`  parser: ${ORACLE_ACTION_PARSER_VERSION}`);
  console.log(`  dev hash: ${dev.contentHash.slice(0, 16)}…`);
  console.log(`  multiface cases: ${multifaceCases.length}`);
  console.log(`  layout support:`, layoutSupport);
  console.log(`  face seg P/R: ${(faceSegmentation.precision * 100).toFixed(1)}% / ${(faceSegmentation.recall * 100).toFixed(1)}%`);
  console.log(`  wrong-face leakage: ${faceAttachment.wrongFaceLeakageCount}`);
  console.log(`  cross-face spans: ${faceAttachment.crossFaceEvidenceSpanCount}`);
  console.log(`  gates:`, gates);
  console.log(`  → ${outPath}`);
}

main();
