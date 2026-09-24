/**
 * Phase 6A.1 — Semantic role adjudication types (Gate C / Gate B shared).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";

export const SEMANTIC_ROLE_TYPES_V1_VERSION = "phase6a1-semantic-role-types-v1";

export type MechanicalVerdict =
  | "DIRECT_ORACLE_MECHANIC"
  | "DERIVED_CAUSAL_SUPPORT"
  | "GENERIC_DECK_SUPPORT"
  | "UNSUPPORTED"
  | "INTERNAL_CONFLICT";

export type SemanticRole =
  | "COMMANDER_PROVIDES"
  | "DECK_REQUIRED_INPUT"
  | "DECK_REQUIRED_ENABLER"
  | "DECK_DESIRED_SUPPORT"
  | "OUTPUT_TO_EXPLOIT"
  | "RESOURCE_TO_PRODUCE"
  | "RESOURCE_TO_CONSUME"
  | "STATE_TO_MAINTAIN"
  | "PAYOFF"
  | "CONTEXT_ONLY";

export type FieldDisposition =
  | "RETAIN"
  | "REMOVE"
  | "RENAME_TYPED"
  | "MOVE_FIELD"
  | "DOWNGRADE_TO_INDIRECT_SUPPORT"
  | "MOVE_TO_CONTEXT_ONLY";

export type SemanticIntentClass =
  | "CANDIDATE_GENERATING_REQUIREMENT"
  | "CANDIDATE_MATCH_CONSTRAINT"
  | "OUTPUT_OR_PAYOFF_CONTEXT"
  | "STATE_OR_ZONE_CONTEXT"
  | "GENERIC_SUPPORT_CONTEXT";

export type SpecFieldKey = keyof RetrievalSpecification;

export type FieldRoleAdjudication = {
  originalField: SpecFieldKey;
  originalValue: string;
  mechanicalVerdict: MechanicalVerdict;
  semanticRole: SemanticRole;
  disposition: FieldDisposition;
  effectiveField?: SpecFieldKey;
  effectiveValue?: string;
  intentClass: SemanticIntentClass;
  causalDefense: string;
  oracleEvidence: string;
};

export type FieldRoleAuditReport = FieldRoleAdjudication & {
  effectiveFieldResolved: SpecFieldKey;
  effectiveValueResolved: string;
  rolePlacementCorrect: boolean;
  gateCFailure?: string;
};

export function expectedFieldForRole(role: SemanticRole): SpecFieldKey | null {
  switch (role) {
    case "COMMANDER_PROVIDES":
    case "OUTPUT_TO_EXPLOIT":
    case "PAYOFF":
      return "outputsToExploit";
    case "DECK_REQUIRED_INPUT":
      return "requiredInputs";
    case "DECK_REQUIRED_ENABLER":
      return "requiredFunctions";
    case "DECK_DESIRED_SUPPORT":
      return "desiredFunctions";
    case "RESOURCE_TO_PRODUCE":
      return "resourcesToProduce";
    case "RESOURCE_TO_CONSUME":
      return "resourcesToConsume";
    case "STATE_TO_MAINTAIN":
      return "statesToMaintain";
    case "CONTEXT_ONLY":
      return null;
    default:
      return null;
  }
}

export function classifyIntentFromPlacement(
  field: SpecFieldKey,
  role: SemanticRole,
  drivesCatalogRole: boolean,
): SemanticIntentClass {
  if (field === "relevantZones" || field === "statesToMaintain" || field === "statesToIncrease") {
    return "STATE_OR_ZONE_CONTEXT";
  }
  if (field === "desiredFunctions" || role === "DECK_DESIRED_SUPPORT") {
    return "GENERIC_SUPPORT_CONTEXT";
  }
  if (
    field === "outputsToExploit" ||
    field === "resourcesToProduce" ||
    role === "COMMANDER_PROVIDES" ||
    role === "OUTPUT_TO_EXPLOIT" ||
    role === "PAYOFF"
  ) {
    return "OUTPUT_OR_PAYOFF_CONTEXT";
  }
  if (field === "requiredInputs" && role === "DECK_REQUIRED_INPUT") {
    return drivesCatalogRole ? "CANDIDATE_GENERATING_REQUIREMENT" : "CANDIDATE_MATCH_CONSTRAINT";
  }
  if (field === "requiredFunctions" && (role === "DECK_REQUIRED_ENABLER" || role === "PAYOFF")) {
    return "CANDIDATE_GENERATING_REQUIREMENT";
  }
  if (field === "resourcesToConsume") {
    return "CANDIDATE_MATCH_CONSTRAINT";
  }
  return "GENERIC_SUPPORT_CONTEXT";
}

export function roleMatchesFieldPlacement(field: SpecFieldKey, role: SemanticRole): boolean {
  const expected = expectedFieldForRole(role);
  if (role === "STATE_TO_MAINTAIN" && (field === "statesToMaintain" || field === "statesToIncrease")) return true;
  if (role === "RESOURCE_TO_PRODUCE" && field === "resourcesToProduce") return true;
  if (role === "RESOURCE_TO_CONSUME" && field === "resourcesToConsume") return true;
  if (role === "CONTEXT_ONLY") return true;
  if (expected === null) return true;
  if (role === "PAYOFF" && field === "requiredFunctions") return true;
  if (role === "DECK_REQUIRED_ENABLER" && field === "requiredFunctions") return true;
  if (role === "OUTPUT_TO_EXPLOIT" && (field === "outputsToExploit" || field === "resourcesToProduce")) return true;
  if (role === "COMMANDER_PROVIDES" && (field === "outputsToExploit" || field === "resourcesToProduce")) return true;
  return field === expected;
}
