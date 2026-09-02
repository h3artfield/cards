/**
 * Professor v4.17 — compile open requirements into Semantic Oracle query shapes.
 */
import type { BrewRequirementV417, RequirementFamilyV417, RequirementFunctionV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SemanticRelationV4 } from "./professor-semantic-vocabulary-v4";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";

export const PROFESSOR_REQUIREMENT_SEMANTIC_QUERY_V4_17_V1_VERSION = "professor-requirement-semantic-query-v4-17-v1";

export type CompiledRequirementSemanticQueryV417 = {
  version: typeof PROFESSOR_REQUIREMENT_SEMANTIC_QUERY_V4_17_V1_VERSION;
  requirementId: string;
  family: RequirementFamilyV417;
  functions: RequirementFunctionV417[];
  primaryRelation: SemanticRelationV4;
  zoneTransitions: string[];
  semanticRelations: SemanticRelationV4[];
  preferTags: string[];
  hardConstraints: string[];
  bracket: number;
  compiledText: string;
  functionalMatchToken: string;
  accessTargetClass?: string;
};

function primaryRelationForFunction(fn: RequirementFunctionV417 | RequirementFamilyV417): SemanticRelationV4 {
  switch (fn) {
    case "RETURN_FROM_GRAVEYARD":
      return "RETURNS_FROM";
    case "GRAVEYARD_ENABLER":
      return "MOVES_ZONE";
    case "INTERACTION":
      return "CONSUMES";
    case "ACCELERATION":
      return "GENERATES_MANA";
    case "CARD_VELOCITY":
      return "DRAWS";
    case "PROTECTION":
      return "AMPLIFIES";
    case "ACCESS":
      return "SEARCHES_FOR";
    case "WIN_COMPONENT":
    case "WIN_SUPPORT":
      return "TRIGGERS_ON";
    case "ENGINE_ENABLER":
    case "ENGINE_PAYOFF":
    case "ENGINE":
      return "PRODUCES";
    case "RESOURCE_PRODUCTION":
      return "PRODUCES";
    case "RESOURCE_CONSUMER":
      return "CONSUMES";
    case "RECOVERY":
      return "RETURNS_FROM";
    default:
      return "PRODUCES";
  }
}

export function compileRequirementSemanticQueryV417(requirement: BrewRequirementV417): CompiledRequirementSemanticQueryV417 {
  const primaryFn = requirement.requiredFunctions[0] ?? requirement.family;
  const primaryRelation = primaryRelationForFunction(primaryFn);
  const family = requirement.family ?? (primaryFn as RequirementFamilyV417);
  const functionalMatchToken =
    requirement.hardRequirements.find((h) => h.semanticToken)?.semanticToken ??
    functionalTokenForFamily(family);

  const zoneTransitions =
    family === "RETURN_FROM_GRAVEYARD" || primaryFn === "RETURN_FROM_GRAVEYARD"
      ? ["GRAVEYARD → BATTLEFIELD", "GRAVEYARD → HAND"]
      : family === "GRAVEYARD_ENABLER"
        ? ["LIBRARY → GRAVEYARD", "HAND → GRAVEYARD"]
        : requirement.requiredMechanics.filter((m) => m.includes("→") || m.includes("GRAVEYARD"));

  const semanticRelations = [primaryRelation, ...requirement.requiredFunctions.map(primaryRelationForFunction)].filter(
    (r, i, arr) => arr.indexOf(r) === i,
  );

  const preferTags = [
    ...requirement.softPreferences,
    ...requirement.preferredRequirements.map((p) => p.description),
    requirement.bracketQualityContract.minimumManaEfficiency === "high" ? "low MV" : "",
    "role compression",
    "independent usefulness",
  ].filter(Boolean);

  const lines = [
    `FAMILY:\n${family}`,
    `FUNCTION:\n${requirement.requiredFunctions.join("\n")}`,
    zoneTransitions.length ? `ZONE_TRANSITION:\n${zoneTransitions.join("\nOR\n")}` : "",
    requirement.accessTargetClass ? `ACCESS_TARGET:\n${requirement.accessTargetClass}` : "",
    preferTags.length ? `PREFER:\n${preferTags.join("\n")}` : "",
    `HARD:\n${requirement.hardRequirements.map((h) => h.description).join("\n")}`,
    `BRACKET:\nB${requirement.bracketQualityContract.requestedBracket}`,
  ].filter(Boolean);

  return {
    version: PROFESSOR_REQUIREMENT_SEMANTIC_QUERY_V4_17_V1_VERSION,
    requirementId: requirement.requirementId,
    family,
    functions: requirement.requiredFunctions,
    primaryRelation,
    zoneTransitions,
    semanticRelations,
    preferTags,
    hardConstraints: requirement.hardConstraints,
    bracket: requirement.bracketQualityContract.requestedBracket,
    compiledText: lines.join("\n\n"),
    functionalMatchToken,
    accessTargetClass: requirement.accessTargetClass,
  };
}
