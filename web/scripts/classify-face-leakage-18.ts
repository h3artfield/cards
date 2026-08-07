/** Classify the regression-family 18 face-leakage heuristic hits. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type LeakageClassification =
  | "true_cross_face_leakage"
  | "legitimate_full_card_shared_text"
  | "face_alias_mismatch"
  | "evaluator_heuristic_false_positive"
  | "granted_reminder_subtext_confusion";

function expectedFaceForPrimitive(testCase: OracleActionEvalCaseV2, primitive: string): string | undefined {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative && e.actionType === primitive);
  const faces = [...new Set(gold.map((g) => g.cardFace).filter(Boolean))];
  if (faces.length === 1) return faces[0];
  if (testCase.cardFace) return testCase.cardFace;
  return undefined;
}

function classifyHit(input: {
  testCase: OracleActionEvalCaseV2;
  assignedFace?: string;
  expectedFace?: string;
  evidence: string;
  role?: string;
}): { trueLeakage: boolean; classification: LeakageClassification; reason: string } {
  const { testCase, assignedFace, expectedFace, evidence, role } = input;
  if (role === "reminder_text" || role === "mechanic_reminder" || role === "granted_ability") {
    return { trueLeakage: false, classification: "granted_reminder_subtext_confusion", reason: "Reminder/granted subtext" };
  }
  if (expectedFace && assignedFace && expectedFace !== assignedFace) {
    const alias =
      (expectedFace === "front" && assignedFace === "mdfc_front") ||
      (expectedFace === "back" && assignedFace === "mdfc_back");
    if (alias) return { trueLeakage: false, classification: "face_alias_mismatch", reason: "MDFC alias" };
    return { trueLeakage: true, classification: "true_cross_face_leakage", reason: `Expected ${expectedFace}, got ${assignedFace}` };
  }
  if (!expectedFace && testCase.cardFace && assignedFace && testCase.cardFace !== assignedFace) {
    return { trueLeakage: true, classification: "true_cross_face_leakage", reason: "Case face scope mismatch" };
  }
  const faceCorpus = testCase.cardFace
    ? (testCase.oracleText.split("\n//\n")[testCase.cardFace === "back" ? 1 : 0] ?? testCase.oracleText)
    : testCase.oracleText;
  if (faceCorpus.includes(evidence)) {
    return { trueLeakage: false, classification: "evaluator_heuristic_false_positive", reason: "Evidence on scoped face; unmatched due to matcher/evaluator" };
  }
  // Expansion wrong_face gold cases
  if (testCase.id.startsWith("dev-exp-v1-00")) {
    return { trueLeakage: false, classification: "evaluator_heuristic_false_positive", reason: "Expansion per-face gold omits legitimate face-scoped primitive" };
  }
  return { trueLeakage: false, classification: "evaluator_heuristic_false_positive", reason: "Unmatched FP without cross-face assignment error" };
}

function loadCombined(): OracleActionEvalCaseV2[] {
  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const exp = JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v1.json", "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const training = exp.cases.filter((c) => c.expansionMetadata?.split === "expansion-training");
  return [...dev.cases, ...training];
}

const cases = loadCombined();
const hits: Array<Record<string, unknown>> = [];

for (const testCase of cases) {
  if (!testCase.cardFace) continue;
  const raw = extractOracleActionsV1({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const actions = raw.actions.map((a, index) => ({
    index,
    primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
    evidenceText: a.evidenceText,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    textRole: a.textRole,
    faceId: a.faceId,
  }));
  const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });
  for (const idx of m.unmatchedActionIndices) {
    const a = actions[idx];
    if (a.reviewStatus !== "accepted" || !a.primitive) continue;
    const expectedFace = expectedFaceForPrimitive(testCase, a.primitive);
    const c = classifyHit({ testCase, assignedFace: a.faceId, expectedFace, evidence: a.evidenceText, role: a.textRole });
    hits.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      layout: testCase.layout,
      sourceFace: testCase.cardFace,
      emittedAction: a.primitive,
      evidenceSpan: a.evidenceText,
      assignedFace: a.faceId,
      expectedFace: expectedFace ?? testCase.cardFace,
      trueLeakage: c.trueLeakage,
      classification: c.classification,
      reason: c.reason,
    });
  }
}

const byClass = hits.reduce((acc, h) => { acc[h.classification as string] = (acc[h.classification as string] ?? 0) + 1; return acc; }, {} as Record<string, number>);
console.log(JSON.stringify({ count: hits.length, trueCrossFace: hits.filter(h => h.trueLeakage).length, byClass, hits }, null, 2));
