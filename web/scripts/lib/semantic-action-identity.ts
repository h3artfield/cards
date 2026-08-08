/**
 * Stable semantic identity keys for deterministic evaluator matching.
 */
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { ExpectedPrimitiveAction } from "./oracle-action-eval-shared";
import type { SemanticActionForMatch } from "./oracle-action-semantic-matcher";

export function stableGoldKey(caseId: string, exp: ExpectedPrimitiveAction, goldIndex: number): string {
  return [
    caseId,
    String(goldIndex).padStart(3, "0"),
    exp.actionType,
    (exp.evidenceContains ?? "").toLowerCase(),
    exp.optionId ?? "",
    exp.abilityIndex ?? "",
    exp.cardFace ?? "",
    exp.loyaltyCost ?? "",
  ].join("\u001f");
}

export function stableActionKey(action: SemanticActionForMatch): string {
  return [
    action.parentAbilityId,
    action.clauseId ?? "",
    action.modalOptionKey ?? action.modalOptionId ?? "",
    action.faceId,
    String(action.segmentAbilityIndex),
    action.actionType,
    String(action.evidenceStart).padStart(5, "0"),
    action.evidenceText.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 64),
    action.optionalEffect ? "opt1" : "opt0",
  ].join("\u001f");
}

export function stableEmittedKey(input: {
  caseId: string;
  oracleId: string;
  action: SemanticActionForMatch;
  extractionSource?: string;
}): string {
  return [
    input.caseId,
    input.oracleId,
    stableActionKey(input.action),
    input.extractionSource ?? "",
  ].join("\u001f");
}

export function sortIndicesByKey<T>(items: T[], keyFn: (item: T, index: number) => string): number[] {
  return items.map((_, index) => index).sort((a, b) => keyFn(items[a]!, a).localeCompare(keyFn(items[b]!, b)));
}

export function actionArgumentsSignature(parse: OracleSemanticParse, actionIndex: number): string {
  const action = parse.actions[actionIndex];
  if (!action) return "";
  const args = action.arguments ?? {};
  return JSON.stringify(args);
}
