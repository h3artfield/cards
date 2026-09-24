/**
 * Phase 6A.1 — Apply semantic role adjudications to effective spec.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  getAllAdjudicationsForCase,
  getSemanticRoleAdjudications,
  SEMANTIC_ROLE_ADJUDICATION_V1_VERSION,
} from "./phase6a1-semantic-role-adjudication-v1";
import type { FieldRoleAdjudication, SpecFieldKey } from "./phase6a1-semantic-role-types-v1";

export { SEMANTIC_ROLE_ADJUDICATION_V1_VERSION };

function cloneSpec(spec: RetrievalSpecification): RetrievalSpecification {
  return {
    ...spec,
    requiredFunctions: [...spec.requiredFunctions],
    desiredFunctions: [...spec.desiredFunctions],
    requiredInputs: [...spec.requiredInputs],
    outputsToExploit: [...spec.outputsToExploit],
    resourcesToProduce: [...spec.resourcesToProduce],
    resourcesToConsume: [...spec.resourcesToConsume],
    statesToMaintain: [...spec.statesToMaintain],
    statesToIncrease: [...spec.statesToIncrease],
    relevantCardTypes: [...spec.relevantCardTypes],
    relevantZones: [...spec.relevantZones],
    protectionNeeds: [...spec.protectionNeeds],
    redundancyNeeds: [...spec.redundancyNeeds],
    structuralNeeds: [...spec.structuralNeeds],
    avoidFunctions: [...spec.avoidFunctions],
    avoidCardClasses: [...spec.avoidCardClasses],
    selfPenaltyConditions: [...spec.selfPenaltyConditions],
    constructionConstraints: [...spec.constructionConstraints],
  };
}

function removeValue(spec: RetrievalSpecification, field: SpecFieldKey, value: string): void {
  const arr = spec[field] as string[];
  (spec[field] as string[]) = arr.filter((v) => v !== value) as never;
}

function addValue(spec: RetrievalSpecification, field: SpecFieldKey, value: string): void {
  const arr = spec[field] as string[];
  if (!arr.includes(value)) (spec[field] as string[]) = [...arr, value] as never;
}

function hasValue(spec: RetrievalSpecification, field: SpecFieldKey, value: string): boolean {
  return (spec[field] as string[]).includes(value);
}

function applyAdjudication(spec: RetrievalSpecification, adj: FieldRoleAdjudication): void {
  const effField = adj.effectiveField ?? adj.originalField;
  const effValue = adj.effectiveValue ?? adj.originalValue;

  switch (adj.disposition) {
    case "RETAIN":
      if (!hasValue(spec, effField, effValue)) addValue(spec, effField, effValue);
      break;
    case "REMOVE":
      if (hasValue(spec, adj.originalField, adj.originalValue)) {
        removeValue(spec, adj.originalField, adj.originalValue);
      }
      break;
    case "RENAME_TYPED":
      if (hasValue(spec, adj.originalField, adj.originalValue)) {
        removeValue(spec, adj.originalField, adj.originalValue);
      }
      addValue(spec, effField, effValue);
      break;
    case "MOVE_FIELD":
      if (hasValue(spec, adj.originalField, adj.originalValue)) {
        removeValue(spec, adj.originalField, adj.originalValue);
      }
      addValue(spec, effField, effValue);
      break;
    case "DOWNGRADE_TO_INDIRECT_SUPPORT":
      if (hasValue(spec, adj.originalField, adj.originalValue)) {
        removeValue(spec, adj.originalField, adj.originalValue);
      }
      addValue(spec, "desiredFunctions", effValue);
      break;
    case "MOVE_TO_CONTEXT_ONLY":
      if (
        adj.originalField !== "relevantZones" &&
        adj.originalField !== "statesToMaintain" &&
        hasValue(spec, adj.originalField, adj.originalValue)
      ) {
        removeValue(spec, adj.originalField, adj.originalValue);
      }
      if (effField === "relevantZones" || effField === "statesToMaintain") {
        addValue(spec, effField, effValue);
      }
      break;
  }
}

export function applySemanticRoleCorrections(input: {
  caseId: string;
  spec: RetrievalSpecification;
  oracleBlob: string;
}): {
  spec: RetrievalSpecification;
  adjudicationsApplied: FieldRoleAdjudication[];
  semanticRoleCorrectionApplied: boolean;
} {
  const explicit = getSemanticRoleAdjudications(input.caseId);
  if (!explicit.length) {
    return { spec: input.spec, adjudicationsApplied: [], semanticRoleCorrectionApplied: false };
  }

  let spec = cloneSpec(input.spec);
  const adjudications = getAllAdjudicationsForCase(input.caseId, spec, input.oracleBlob);

  for (const adj of adjudications) {
    if (adj.disposition === "RETAIN" && !hasValue(spec, adj.originalField, adj.originalValue)) {
      if (getSemanticRoleAdjudications(input.caseId).some((e) => e.originalField === adj.originalField && e.originalValue === adj.originalValue)) {
        applyAdjudication(spec, adj);
      }
      continue;
    }
    if (adj.disposition !== "RETAIN" || hasValue(spec, adj.originalField, adj.originalValue)) {
      applyAdjudication(spec, adj);
    }
  }

  return {
    spec,
    adjudicationsApplied: adjudications,
    semanticRoleCorrectionApplied: true,
  };
}

export function getSemanticRoleAdjudicationsForCase(
  caseId: string,
  spec: RetrievalSpecification,
  oracleBlob: string,
): FieldRoleAdjudication[] {
  return getAllAdjudicationsForCase(caseId, spec, oracleBlob);
}
