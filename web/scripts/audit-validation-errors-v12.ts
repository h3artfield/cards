/**
 * Full validation error audit for validation_set_v2 against parser v1.12.
 * Run: npx tsx scripts/audit-validation-errors-v12.ts
 */
import { readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evaluateCaseUnified,
  sumUnifiedMetrics,
  matchGoldToActions,
  primitiveMatchesExpected,
} from "./oracle-action-unified-matcher";
import {
  REVIEWER_ID,
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
  type ExpectedPrimitiveAction,
} from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { HELD_OUT_CARD_NAMES } from "./validation-held-out-card-names";

export type ValidationMismatchClassification =
  | "missing_gold_label"
  | "incorrect_gold_primitive"
  | "wrong_parser_primitive"
  | "unsupported_parser_extraction"
  | "duplicate_extraction"
  | "wrong_ability_attachment"
  | "wrong_condition_or_optionality"
  | "wrong_zone"
  | "wrong_face"
  | "missing_parser_grammar"
  | "confidence_calibration_failure"
  | "evaluator_defect";

const MILESTONE_COMMIT = "39a1e6108b97f084565e9151f5f3eef953762885";
const VALIDATION_V2_HASH = "496a5dd7fcc5c6259f600e25aeecaeead6a036a6574b53cc58e9001321943734";

interface ActionRow {
  index: number;
  primitive: string | null;
  actionType: string;
  evidenceText: string;
  cardFaceId: string;
  abilityIndex: number;
  reviewStatus: string;
  confidence: number;
  optionalEffect?: boolean;
  optional?: boolean;
  optionalCost?: boolean;
  evidenceStart: number;
  evidenceEnd: number;
}

function cardName(caseId: string): string {
  return HELD_OUT_CARD_NAMES[caseId] ?? caseId;
}

function classifyFalsePositive(input: {
  testCase: OracleActionEvalCaseV2;
  action: ActionRow;
  allActions: ActionRow[];
  matchedExpectedIndices: Set<number>;
}): ValidationMismatchClassification {
  const { testCase, action, allActions, matchedExpectedIndices } = input;
  const primitive = action.primitive;
  if (!primitive) return "evaluator_defect";

  const spanOk = spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd);
  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText);

  if (!spanOk || !supported) return "unsupported_parser_extraction";
  if (supported !== primitive) return "wrong_parser_primitive";
  if (testCase.cardFace && action.cardFaceId !== testCase.cardFace) return "wrong_face";

  const duplicate = allActions.some(
    (o) =>
      o.index !== action.index &&
      o.primitive === primitive &&
      evidenceMatchesExtracted(o.evidenceText, action.evidenceText.slice(0, 24)),
  );
  if (duplicate) return "duplicate_extraction";

  const sameEvidenceWrongType = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.evidenceContains &&
      evidenceMatchesExtracted(action.evidenceText, e.evidenceContains) &&
      e.actionType !== primitive,
  );
  if (sameEvidenceWrongType) return "incorrect_gold_primitive";

  const looseExpected = testCase.expectedPrimitiveActions.find(
    (e) => !e.negative && e.actionType === primitive && evidenceMatchesOracle(testCase.oracleText, action.evidenceText),
  );
  if (looseExpected) {
    const expectedOptional = looseExpected.optionalEffect ?? looseExpected.optional;
    const gotOptional = action.optionalEffect ?? action.optional;
    if (expectedOptional !== undefined && gotOptional !== expectedOptional) {
      return "wrong_condition_or_optionality";
    }
    if (!evidenceMatchesExtracted(action.evidenceText, looseExpected.evidenceContains)) {
      return "evaluator_defect";
    }
    if (matchedExpectedIndices.has(testCase.expectedPrimitiveActions.indexOf(looseExpected))) {
      return "duplicate_extraction";
    }
    return "evaluator_defect";
  }

  if (testCase.expectedPrimitiveActions.some((e) => !e.negative && e.actionType === primitive)) {
    return "wrong_ability_attachment";
  }

  if (supported === primitive && evidenceMatchesOracle(testCase.oracleText, action.evidenceText)) {
    return "missing_gold_label";
  }

  if (action.reviewStatus === "accepted" && action.confidence >= 0.88 && !supported) {
    return "confidence_calibration_failure";
  }

  return "wrong_ability_attachment";
}

function classifyFalseNegative(input: {
  testCase: OracleActionEvalCaseV2;
  expected: ExpectedPrimitiveAction;
  actions: ActionRow[];
}): ValidationMismatchClassification {
  const { testCase, expected, actions } = input;

  const loose = actions.find(
    (a) =>
      a.primitive === expected.actionType &&
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains) &&
      (!expected.cardFace || a.cardFaceId === expected.cardFace),
  );
  if (loose) {
    const expectedOptional = expected.optionalEffect ?? expected.optional;
    const gotOptional = loose.optionalEffect ?? loose.optional;
    if (expectedOptional !== undefined && gotOptional !== expectedOptional) {
      return "wrong_condition_or_optionality";
    }
    if (loose.reviewStatus === "needs_review" && loose.confidence >= 0.88) {
      return "confidence_calibration_failure";
    }
    return "evaluator_defect";
  }

  const related = actions.find(
    (a) =>
      a.primitive === expected.actionType ||
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains),
  );
  if (related) {
    if (related.primitive !== expected.actionType) return "wrong_parser_primitive";
    return "wrong_ability_attachment";
  }

  if (testCase.expectedStructure && !expected.actionType) return "evaluator_defect";
  if (evidenceMatchesOracle(testCase.oracleText, expected.evidenceContains)) {
    return "missing_parser_grammar";
  }
  return "incorrect_gold_primitive";
}

function proposedResolution(
  kind: "fp" | "fn",
  classification: ValidationMismatchClassification,
): string {
  const map: Record<ValidationMismatchClassification, string> = {
    missing_gold_label: "Adjudicate Oracle text; accept label, reject, or reclassify as structure-only.",
    incorrect_gold_primitive: "Correct gold primitive or remove erroneous gold expectation.",
    wrong_parser_primitive: "Improve primitive disambiguation grammar on development expansion cards.",
    unsupported_parser_extraction: "Add pattern guard or route similar spans to abstained/needs_review.",
    duplicate_extraction: "Improve canonical dedup or clause segmentation.",
    wrong_ability_attachment: "Improve ability segmentation or action-to-clause attachment.",
    wrong_condition_or_optionality: "Improve may-scope or optionality attachment calibration.",
    wrong_zone: "Improve zone inference from oracle phrasing.",
    wrong_face: "Improve multiface evidence containment gates.",
    missing_parser_grammar: "Add general grammar pattern via development expansion, not validation card.",
    confidence_calibration_failure: "Lower acceptance threshold or add structural uncertainty gate.",
    evaluator_defect: "Fix matcher or gold evidence span alignment.",
  };
  return kind === "fp" ? map[classification] : map[classification];
}

export function auditValidationSet(cases: OracleActionEvalCaseV2[]) {
  const records: Array<{
    mismatchKind: "false_positive" | "false_negative";
    tier: "accepted" | "needs_review" | "all_emission";
    caseId: string;
    cardName: string;
    oracleId: string;
    cardFace: string;
    oracleText: string;
    expectedPrimitive?: string;
    expectedEvidence?: string;
    parserPrimitive?: string;
    parserEvidence?: string;
    reviewStatus?: string;
    confidence?: number;
    classification: ValidationMismatchClassification;
    proposedResolution: string;
    reviewer: string;
  }> = [];

  const caseMetrics = cases.map((testCase) => {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const actions: ActionRow[] = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      actionType: a.actionType,
      evidenceText: a.evidenceText,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus,
      confidence: a.confidence,
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
    }));

    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const allMatch = matchGoldToActions({
      expected,
      actions: actions.map((a) => ({
        index: a.index,
        primitive: a.primitive,
        evidenceText: a.evidenceText,
        cardFaceId: a.cardFaceId,
        abilityIndex: a.abilityIndex,
        reviewStatus: a.reviewStatus as "accepted" | "needs_review",
        optionalEffect: a.optionalEffect,
        optional: a.optional,
        optionalCost: a.optionalCost,
      })),
      tier: "all",
    });

    const matchedExpectedIndices = new Set(
      allMatch.matches.filter((m) => m.matched).map((m) => m.expectedIndex),
    );

    for (const actionIndex of allMatch.unmatchedActionIndices) {
      const action = actions[actionIndex];
      if (!action.primitive) continue;
      const classification = classifyFalsePositive({
        testCase,
        action,
        allActions: actions,
        matchedExpectedIndices,
      });
      records.push({
        mismatchKind: "false_positive",
        tier: action.reviewStatus === "accepted" ? "accepted" : "needs_review",
        caseId: testCase.id,
        cardName: cardName(testCase.id),
        oracleId: testCase.oracleId,
        cardFace: action.cardFaceId,
        oracleText: testCase.oracleText,
        parserPrimitive: action.primitive,
        parserEvidence: action.evidenceText,
        reviewStatus: action.reviewStatus,
        confidence: action.confidence,
        classification,
        proposedResolution: proposedResolution("fp", classification),
        reviewer: REVIEWER_ID,
      });
    }

    for (const expectedIndex of allMatch.unmatchedExpectedIndices) {
      const exp = expected[expectedIndex];
      const classification = classifyFalseNegative({ testCase, expected: exp, actions });
      records.push({
        mismatchKind: "false_negative",
        tier: "all_emission",
        caseId: testCase.id,
        cardName: cardName(testCase.id),
        oracleId: testCase.oracleId,
        cardFace: exp.cardFace ?? testCase.cardFace ?? "front",
        oracleText: testCase.oracleText,
        expectedPrimitive: exp.actionType,
        expectedEvidence: exp.evidenceContains,
        classification,
        proposedResolution: proposedResolution("fn", classification),
        reviewer: REVIEWER_ID,
      });
    }

    return evaluateCaseUnified(
      testCase,
      raw.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
        optionalCost: a.optionalCost,
      })),
    );
  });

  const totals = sumUnifiedMetrics(caseMetrics);
  const goldPositiveCount = totals.allEmission.truePositives + totals.allEmission.falseNegatives;

  return { records, totals, goldPositiveCount, caseMetrics };
}

function main() {
  const baselineDir = resolve(process.cwd(), "data", "milestones", "validation-v12-pre-adjudication");
  mkdirSync(baselineDir, { recursive: true });

  const srcReport = resolve(process.cwd(), "reports", "oracle-action-eval-validation-v12-milestone.json");
  if (existsSync(srcReport)) {
    copyFileSync(srcReport, resolve(baselineDir, "oracle-action-eval-validation-v12-milestone.json"));
  }

  writeFileSync(
    resolve(baselineDir, "milestone-freeze.json"),
    JSON.stringify(
      {
        frozenAt: new Date().toISOString(),
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        commitSha: MILESTONE_COMMIT,
        developmentSet: {
          classification: "development_set_v7",
          contentHash: "6274107dfae50b3c8938099079004e36bdf3ce18e3bb3b8407e9af1cf409a147",
        },
        validationSet: {
          classification: "validation_set_v2",
          contentHash: VALIDATION_V2_HASH,
        },
        preAdjudicationReport: "data/milestones/validation-v12-pre-adjudication/oracle-action-eval-validation-v12-milestone.json",
        note: "Immutable pre-adjudication baseline — do not overwrite.",
      },
      null,
      2,
    ),
    "utf8",
  );

  const val = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v2.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  const audit = auditValidationSet(val.cases);

  const classificationCounts = audit.records.reduce(
    (acc, r) => {
      acc[r.classification] = (acc[r.classification] ?? 0) + 1;
      return acc;
    },
    {} as Record<ValidationMismatchClassification, number>,
  );

  const missingGold = audit.records.filter((r) => r.classification === "missing_gold_label");
  const unsupportedAccepted = audit.records.filter(
    (r) =>
      r.mismatchKind === "false_positive" &&
      r.classification === "unsupported_parser_extraction" &&
      r.reviewStatus === "accepted",
  );

  const failureFamilies = {
    hand_to_battlefield_put_misclassified_as_search: audit.records.filter(
      (r) => r.caseId === "held-0025" || r.caseId === "held-0058",
    ).length,
    static_cast_restriction_false_positives: audit.records.filter(
      (r) =>
        r.classification === "missing_gold_label" &&
        r.parserPrimitive === "cast" &&
        (r.caseId === "held-0017" || r.caseId === "held-0075"),
    ).length,
    alternative_cost_cast_false_positives: audit.records.filter(
      (r) =>
        r.classification === "missing_gold_label" &&
        r.parserPrimitive === "cast" &&
        ["held-0019", "held-0101", "held-0102", "held-0103"].includes(r.caseId),
    ).length,
    return_zone_primitive_confusion: audit.records.filter(
      (r) => r.classification === "wrong_parser_primitive" && r.parserPrimitive === "return_to_hand",
    ).length,
    missing_parser_grammar: audit.records.filter((r) => r.classification === "missing_parser_grammar").length,
    trigger_condition_extraction: audit.records.filter(
      (r) => r.caseId === "held-0041" || r.classification === "wrong_ability_attachment",
    ).length,
    unsupported_accepted_extraction: audit.records.filter(
      (r) => r.classification === "unsupported_parser_extraction" && r.reviewStatus === "accepted",
    ).length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    commitSha: MILESTONE_COMMIT,
    validationSet: "validation_set_v2",
    validationSetHash: val.contentHash,
    metrics: {
      accepted: audit.totals.accepted,
      needsReview: audit.totals.needsReview,
      allEmission: audit.totals.allEmission,
      goldPositiveCount: audit.goldPositiveCount,
    },
    mismatchCount: audit.records.length,
    falsePositiveCount: audit.records.filter((r) => r.mismatchKind === "false_positive").length,
    falseNegativeCount: audit.records.filter((r) => r.mismatchKind === "false_negative").length,
    classificationCounts,
    missingGoldLabelCases: missingGold,
    unsupportedAcceptedActions: unsupportedAccepted,
    failureFamilies,
    missingGoldAdjudication: "adjudicate-validation-missing-gold-v12.ts",
    records: audit.records,
  };

  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  const outPath = resolve(process.cwd(), "reports", "oracle-action-validation-error-audit-v12.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Metrics:", report.metrics);
  console.log("FP/FN:", report.falsePositiveCount, report.falseNegativeCount);
  console.log("Classifications:", classificationCounts);
  console.log("Missing gold:", missingGold.length);
  console.log("Unsupported accepted:", unsupportedAccepted.length);
  console.log("→", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("audit-validation-errors-v12.ts")) {
  main();
}
