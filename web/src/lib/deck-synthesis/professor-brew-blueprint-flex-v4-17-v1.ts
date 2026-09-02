/**
 * Professor v4.17 Slice 5.2 — flex requirement materialization after mandatory structure closure.
 */
import {
  bracketQualityContractV417,
  type BrewBlueprintV417,
  type BrewRequirementV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";
import {
  computeFunctionalDensityStatesV417,
  diagnoseFlexEntryV417,
  isNonlandFunctionalBudget,
  mandatoryStructureSatisfiedV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_FLEX_V4_17_V1_VERSION = "professor-brew-blueprint-flex-v4-17-v1";

export { mandatoryStructureSatisfiedV417, diagnoseFlexEntryV417 };

type FlexKind =
  | "FLEX_INTERACTION"
  | "FLEX_RESILIENCE"
  | "FLEX_ROLE_COMPRESSION"
  | "FLEX_CARD_QUALITY"
  | "FLEX_RECOVERY"
  | "FLEX_ACCESS"
  | "FLEX_WIN_RELIABILITY";

function flexFamily(kind: FlexKind): BrewRequirementV417["family"] {
  switch (kind) {
    case "FLEX_INTERACTION":
      return "INTERACTION";
    case "FLEX_RESILIENCE":
      return "PROTECTION";
    case "FLEX_RECOVERY":
      return "RECOVERY";
    case "FLEX_ACCESS":
      return "ACCESS";
    case "FLEX_WIN_RELIABILITY":
      return "WIN_COMPONENT";
    case "FLEX_ROLE_COMPRESSION":
      return "CARD_VELOCITY";
    default:
      return "CARD_VELOCITY";
  }
}

function flexFunctions(kind: FlexKind): BrewRequirementV417["requiredFunctions"] {
  switch (kind) {
    case "FLEX_INTERACTION":
      return ["INTERACTION"];
    case "FLEX_RESILIENCE":
      return ["PROTECTION", "RECOVERY"];
    case "FLEX_RECOVERY":
      return ["RECOVERY"];
    case "FLEX_ACCESS":
      return ["ACCESS"];
    case "FLEX_WIN_RELIABILITY":
      return ["WIN_COMPONENT"];
    case "FLEX_ROLE_COMPRESSION":
      return ["CARD_VELOCITY", "INTERACTION"];
    default:
      return ["CARD_VELOCITY"];
  }
}

function buildFlexRequirement(blueprint: BrewBlueprintV417, kind: FlexKind, index: number): BrewRequirementV417 {
  const family = flexFamily(kind);
  const bracket = blueprint.userIntent.bracket;
  return {
    requirementId: `flex-${kind.toLowerCase()}-${index}`,
    blueprintRevisionId: blueprint.revisionHistory.length ? Math.max(...blueprint.revisionHistory.map((r) => r.revision)) : 0,
    family,
    purpose: `${kind.replace(/_/g, " ").toLowerCase()} — marginal optimization from blueprint weakness audit`,
    priority: 48,
    coverageMode: "FUNCTIONAL_COVERAGE",
    sharePolicy: "GLOBAL_SHAREABLE",
    physicalSlotsNeeded: { min: 0, preferred: 1, max: 2 },
    requiredFunctions: flexFunctions(kind),
    requiredMechanics: [],
    hardRequirements: [
      { constraintId: "legal", description: "Legal in commander color identity" },
      { constraintId: "function", description: `Improve ${family} portfolio`, semanticToken: functionalTokenForFamily(family) },
    ],
    preferredRequirements: [{ qualityId: "quality", description: "premium bracket quality", weight: 0.85 }],
    acceptableFunctionalAlternatives: [],
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: ["role compression", "marginal utility", "saturation aware"],
    packageIds: [],
    bracketQualityContract: bracketQualityContractV417(bracket),
    requirementBracketContract: requirementBracketContractV417(family, bracket),
    currentCoverage: 0,
    targetCoverage: 1,
    selectedCardIds: [],
    status: "OPEN",
  };
}

function blueprintOptimizationWeaknesses(blueprint: BrewBlueprintV417): FlexKind[] {
  const kinds: FlexKind[] = [];
  const states = computeFunctionalDensityStatesV417(blueprint).filter(isNonlandFunctionalBudget);
  const bracket = blueprint.userIntent.bracket;

  const interaction = states.find((s) => s.normalizedFunctions.includes("INTERACTION"));
  if (interaction && interaction.remainingPreferredDeficit > 0) kinds.push("FLEX_INTERACTION");

  const recovery = states.find((s) => s.normalizedFunctions.includes("RECOVERY"));
  const protection = states.find((s) => s.normalizedFunctions.includes("PROTECTION"));
  if ((recovery?.remainingPreferredDeficit ?? 0) > 0 || (protection?.remainingPreferredDeficit ?? 0) > 0) {
    kinds.push("FLEX_RESILIENCE");
  }

  const access = states.find((s) => s.normalizedFunctions.includes("ACCESS"));
  if (access && access.remainingPreferredDeficit > 0) kinds.push("FLEX_ACCESS");

  const win = states.find((s) => s.normalizedFunctions.includes("WIN_COMPONENT"));
  if (win && win.remainingPreferredDeficit > 0) kinds.push("FLEX_WIN_RELIABILITY");

  if (blueprint.selectedCards.filter((c) => c.satisfiedFunctions.length >= 2).length < blueprint.selectedCards.length * 0.3) {
    kinds.push("FLEX_ROLE_COMPRESSION");
  }

  if (bracket >= 4) kinds.push("FLEX_CARD_QUALITY");

  const preferredRemaining = states.reduce((sum, s) => sum + s.remainingPreferredDeficit, 0);
  if (preferredRemaining > 0 && kinds.length === 0) kinds.push("FLEX_CARD_QUALITY");

  return [...new Set(kinds)];
}

export function materializeFlexRequirementsV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  if (blueprint.physicalSlotBudget.remainingNonlandSlots <= 0) return blueprint;
  if (!mandatoryStructureSatisfiedV417(blueprint)) return blueprint;
  const flexEntry = diagnoseFlexEntryV417(blueprint);
  if (!flexEntry.flexPrimaryAllowed) return blueprint;

  const existingFlex = blueprint.openRequirements.filter((r) => r.requirementId.startsWith("flex-"));
  const openFlex = existingFlex.filter((r) => r.status === "OPEN" || r.status === "PARTIAL");
  if (openFlex.length >= Math.min(3, blueprint.physicalSlotBudget.remainingNonlandSlots)) return blueprint;
  if (openFlex.length > 0) return blueprint;

  const weaknesses = blueprintOptimizationWeaknesses(blueprint);
  const slotsToFill = Math.min(blueprint.physicalSlotBudget.remainingNonlandSlots, Math.max(1, weaknesses.length));
  if (slotsToFill <= 0) return blueprint;

  const flexEntryTelemetry = flexEntry;
  const newReqs = weaknesses.slice(0, slotsToFill).map((kind, idx) => buildFlexRequirement(blueprint, kind, idx));

  return {
    ...blueprint,
    flexEntryTelemetry,
    openRequirements: [...blueprint.openRequirements, ...newReqs],
  };
}
