import { readFileSync } from "node:fs";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";

function primitiveMatchesExpected(
  action: { actionType: string; evidenceText: string; evidenceStart: number; evidenceEnd: number; cardFaceId: string },
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): boolean {
  if (action.actionType !== exp.actionType) return false;
  return evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains);
}

function classifyFalsePositive(input: {
  testCase: OracleActionEvalCaseV2;
  action: {
    actionType: string;
    evidenceText: string;
    evidenceStart: number;
    evidenceEnd: number;
    cardFaceId: string;
  };
  oracleText: string;
  matchedExpectedIndices: Set<number>;
  allActions: Array<{ actionType: string; evidenceText: string }>;
}): string {
  const { testCase, action, oracleText } = input;
  const primitive = normalizeToPrimitive(action.actionType, action.evidenceText);

  if (!spanValid(oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)) {
    return "genuinely_unsupported_extraction";
  }

  if (testCase.forbiddenPrimitiveActions?.includes(action.actionType)) {
    const supported = inferSupportedPrimitiveFromEvidence(oracleText, action.evidenceText);
    if (!supported || supported === primitive) return "genuinely_unsupported_extraction";
    return "wrong_primitive_action_type";
  }

  const supported = inferSupportedPrimitiveFromEvidence(oracleText, action.evidenceText);
  if (!supported) return "genuinely_unsupported_extraction";
  if (primitive !== supported) return "wrong_primitive_action_type";
  if (testCase.cardFace && action.cardFaceId !== testCase.cardFace) return "wrong_card_face";

  const looseExpected = testCase.expectedPrimitiveActions.find(
    (e) => !e.negative && e.actionType === primitive && evidenceMatchesOracle(oracleText, action.evidenceText),
  );
  if (looseExpected) return "evaluator_matching_defect";

  if (testCase.expectedPrimitiveActions.find((e) => !e.negative && e.actionType === primitive)) {
    return "granularity_mismatch";
  }

  const wrongTypeInGold = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.evidenceContains &&
      evidenceMatchesExtracted(action.evidenceText, e.evidenceContains) &&
      e.actionType !== primitive,
  );
  if (wrongTypeInGold) return "incorrect_evidence_to_action_mapping";

  if (supported === primitive && evidenceMatchesOracle(oracleText, action.evidenceText)) {
    return "correct_action_missing_from_gold_labels";
  }

  return "wrong_primitive_action_type";
}

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v18.json", "utf8"));

for (const testCase of dev.cases as OracleActionEvalCaseV2[]) {
  const raw = extractOracleActionsV1({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  const extraction = toLegacyExtractionResult(raw);
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const matchedExpected = new Set<number>();
  const matchedActions = new Set<number>();

  for (let ei = 0; ei < expected.length; ei++) {
    const exp = expected[ei];
    const idx = extraction.actions.findIndex(
      (a, ai) =>
        !matchedActions.has(ai) &&
        a.effects[0]?.actionType === exp.actionType &&
        evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
    );
    if (idx >= 0) {
      matchedExpected.add(ei);
      matchedActions.add(idx);
    }
  }

  for (let ai = 0; ai < extraction.actions.length; ai++) {
    if (matchedActions.has(ai)) continue;
    const legacy = extraction.actions[ai];
    const actionType = legacy.effects[0]?.actionType;
    if (!actionType) continue;
    const action = {
      actionType,
      evidenceText: legacy.evidenceText,
      evidenceStart: legacy.evidenceStart,
      evidenceEnd: legacy.evidenceEnd,
      cardFaceId: legacy.cardFaceId,
      reviewStatus: legacy.reviewStatus,
    };
    const fpCategory = classifyFalsePositive({
      testCase,
      action,
      oracleText: testCase.oracleText,
      matchedExpectedIndices: matchedExpected,
      allActions: extraction.actions.map((a) => ({
        actionType: a.effects[0]?.actionType ?? "",
        evidenceText: a.evidenceText,
      })),
    });
    if (fpCategory === "genuinely_unsupported_extraction") {
      console.log(
        JSON.stringify({
          id: testCase.id,
          card: testCase.cardName,
          status: action.reviewStatus,
          actionType: action.actionType,
          evidence: action.evidenceText,
          forbidden: testCase.forbiddenPrimitiveActions,
          span: [action.evidenceStart, action.evidenceEnd],
          spanOk: spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd),
          supported: inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText),
        }),
      );
    }
  }
}
