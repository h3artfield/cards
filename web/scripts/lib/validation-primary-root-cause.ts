/**
 * Non-overlapping primary root-cause taxonomy for validation milestone diagnostics.
 * Each mismatch gets exactly one primary category; secondary tags are optional descriptors.
 */
import { isIntentionallyExcludedFromGold } from "./validation-oracle-adjudications";
import type { ValidationMismatchClassification } from "../audit-validation-errors-v12";
import { evidenceMatchesExtracted } from "../oracle-action-eval-shared";

export type PrimaryRootCause =
  | "gold_defect"
  | "evaluator_defect"
  | "missing_grammar"
  | "span_role"
  | "compound_clause"
  | "face_component"
  | "wrong_primitive"
  | "confidence_calibration"
  | "other_parser_defect";

export function assignPrimaryRootCause(input: {
  mismatchKind: "false_positive" | "false_negative";
  auditClassification: ValidationMismatchClassification;
  testCase: OracleActionEvalCaseV2;
  parserPrimitive?: string;
  parserEvidence?: string;
  expectedPrimitive?: string;
  textRole?: string;
}): PrimaryRootCause {
  const { mismatchKind, auditClassification, testCase, parserPrimitive, parserEvidence, expectedPrimitive, textRole } =
    input;

  if (auditClassification === "evaluator_defect") return "evaluator_defect";
  if (auditClassification === "incorrect_gold_primitive") return "gold_defect";
  if (auditClassification === "missing_gold_label") {
    if (parserEvidence && isIntentionallyExcludedFromGold(parserEvidence)) {
      return textRole === "reminder_text" || textRole === "mechanic_reminder" ? "span_role" : "other_parser_defect";
    }
    if (parserEvidence && /\bStorm \(|\bCycling \{|\bFlashback \{/i.test(testCase.oracleText)) {
      return "span_role";
    }
    return "gold_defect";
  }
  if (auditClassification === "wrong_face") return "face_component";
  if (auditClassification === "confidence_calibration_failure") return "confidence_calibration";
  if (auditClassification === "wrong_condition_or_optionality") return "other_parser_defect";
  if (auditClassification === "wrong_ability_attachment") {
    if (testCase.cardFace && testCase.oracleText.includes("\n//\n")) return "face_component";
    return "other_parser_defect";
  }
  if (auditClassification === "duplicate_extraction") return "other_parser_defect";
  if (auditClassification === "unsupported_parser_extraction") {
    if (textRole === "reminder_text" || textRole === "mechanic_reminder" || textRole === "cost") return "span_role";
    return "other_parser_defect";
  }
  if (auditClassification === "wrong_parser_primitive") return "wrong_primitive";
  if (auditClassification === "missing_parser_grammar") return "missing_grammar";

  if (mismatchKind === "false_positive" && parserEvidence && /\bthen\b/i.test(testCase.oracleText)) {
    return "compound_clause";
  }
  if (mismatchKind === "false_positive" && parserPrimitive && parserEvidence) {
    const goldHasType = testCase.expectedPrimitiveActions.some(
      (e) => !e.negative && e.actionType === parserPrimitive,
    );
    if (!goldHasType && evidenceMatchesExtracted(testCase.oracleText, parserEvidence)) {
      return "gold_defect";
    }
  }
  if (mismatchKind === "false_negative" && expectedPrimitive) {
    const exp = testCase.expectedPrimitiveActions.find((e) => e.actionType === expectedPrimitive);
    if (exp && !evidenceMatchesExtracted(testCase.oracleText, exp.evidenceContains)) {
      return "gold_defect";
    }
    return "missing_grammar";
  }

  return "other_parser_defect";
}

export function summarizePrimaryRootCauses(
  records: Array<{ primaryRootCause: PrimaryRootCause }>,
): Record<PrimaryRootCause, number> {
  const counts: Record<PrimaryRootCause, number> = {
    gold_defect: 0,
    evaluator_defect: 0,
    missing_grammar: 0,
    span_role: 0,
    compound_clause: 0,
    face_component: 0,
    wrong_primitive: 0,
    confidence_calibration: 0,
    other_parser_defect: 0,
  };
  for (const r of records) counts[r.primaryRootCause] += 1;
  return counts;
}
