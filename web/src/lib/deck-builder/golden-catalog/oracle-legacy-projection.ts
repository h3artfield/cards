/**
 * Legacy compatibility projection from canonical OracleSemanticParse.
 * Downstream eval may consume this during migration; semantic parse remains source of truth.
 */
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import { optionOrdinalKey } from "./oracle-semantic-parse-schema";
import type { OracleSemanticParse, SemanticAbility, SemanticAction } from "./oracle-semantic-parse-schema";

function abilityById(abilities: SemanticAbility[], abilityId: string): SemanticAbility | undefined {
  return abilities.find((a) => a.abilityId === abilityId);
}

function resolveLoyaltyCost(action: SemanticAction, abilities: SemanticAbility[]): string | undefined {
  const parent = abilityById(abilities, action.parentAbilityId);
  return parent?.loyaltyCost;
}

function resolveModalOptionKey(action: SemanticAction, abilities: SemanticAbility[]): string | undefined {
  if (!action.modalOptionId) return undefined;
  for (const ability of abilities) {
    for (const opt of ability.options ?? []) {
      if (opt.optionId === action.modalOptionId) {
        return optionOrdinalKey(opt.ordinal);
      }
    }
  }
  const tail = action.modalOptionId.match(/\.opt-(\d+)$/);
  return tail ? `opt-${tail[1]}` : action.modalOptionId;
}

/** Project one semantic action into legacy OracleActionV1 shape for eval parity. */
export function projectSemanticActionToLegacy(
  parse: OracleSemanticParse,
  action: SemanticAction,
): Pick<
  OracleActionV1,
  | "oracleId"
  | "faceId"
  | "abilityIndex"
  | "actionType"
  | "evidenceText"
  | "evidenceStart"
  | "evidenceEnd"
  | "loyaltyCost"
  | "modalOptionId"
  | "clauseId"
  | "parentAbilityId"
  | "reviewStatus"
  | "optionalEffect"
  | "optionalCost"
  | "optional"
  | "actionId"
  | "parserVersion"
  | "quantityType"
  | "quantityBase"
  | "quantityDivisor"
  | "quantityMultiplier"
  | "quantityRounding"
> {
  const parent = abilityById(parse.abilities, action.parentAbilityId);
  const span = action.provenance.actionSpan;
  const qty = action.arguments.quantity;
  return {
    oracleId: parse.oracleId,
    faceId: parent?.faceId ?? parse.abilities[0]?.faceId ?? "front",
    abilityIndex: action.segmentAbilityIndex,
    actionType: action.actionType,
    evidenceText: span.text,
    evidenceStart: span.cardStart,
    evidenceEnd: span.cardEnd,
    loyaltyCost: resolveLoyaltyCost(action, parse.abilities),
    modalOptionId: resolveModalOptionKey(action, parse.abilities),
    clauseId: action.clauseId,
    parentAbilityId: action.parentAbilityId,
    reviewStatus: action.reviewStatus,
    optionalEffect: action.optionalEffect ?? false,
    optionalCost: action.optionalCost,
    optional: action.optionalEffect ?? false,
    actionId: action.actionId,
    parserVersion: action.parserVersion,
    quantityType: qty?.quantityType,
    quantityBase: qty?.quantityBase,
    quantityDivisor: qty?.quantityDivisor,
    quantityMultiplier: qty?.quantityMultiplier,
    quantityRounding: qty?.quantityRounding,
  };
}

/** Project all semantic actions to legacy-compatible records. */
export function projectLegacyFromSemanticParse(parse: OracleSemanticParse) {
  return parse.actions.map((action) => projectSemanticActionToLegacy(parse, action));
}
