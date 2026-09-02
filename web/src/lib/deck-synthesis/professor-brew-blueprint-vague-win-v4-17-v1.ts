/**
 * Professor v4.17 Slice 5 — vague win hypothesis decomposition (Korvold path).
 */
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { classifyWinArchitectureTypeV417, isWinResearchableV417 } from "./professor-win-architecture-v4-17-v1";
import type { AssemblyFailureStateV417 } from "./professor-blueprint-assembly-types-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_VAGUE_WIN_V4_17_V1_VERSION = "professor-brew-blueprint-vague-win-v4-17-v1";

export type VagueWinDecompositionV417 = {
  planId: string;
  originalPlan: string;
  vague: boolean;
  researchable: boolean;
  winType: ReturnType<typeof classifyWinArchitectureTypeV417>;
  resourceProduced: string | null;
  resourceConsumed: string | null;
  resetMechanism: string | null;
  repetitionLoop: string | null;
  winConversion: string | null;
  verdict: "DECOMPOSED" | "CREATIVE_REVISION_REQUIRED" | "ALREADY_CONCRETE" | "RESEARCHABLE_COMBAT_CLOCK";
  functionalRequirements: string[];
};

function inferFromPlan(plan: string): Omit<VagueWinDecompositionV417, "planId" | "originalPlan" | "vague" | "researchable" | "verdict" | "functionalRequirements" | "winType"> {
  const lower = plan.toLowerCase();
  return {
    resourceProduced: /token|treasure|food|mana|draw|card/i.test(lower) ? "resources_from_repeated_actions" : null,
    resourceConsumed: /sacrifice|pay|discard|exile/i.test(lower) ? "permanents_or_resources" : null,
    resetMechanism: /return|recur|from graveyard|reset|each turn|whenever/i.test(lower) ? "zone_recursion_or_triggers" : null,
    repetitionLoop: /loop|repeat|each time|whenever you sacrifice|whenever a creature dies/i.test(lower) ? "triggered_repetition" : null,
    winConversion: /drain|commander damage|combat|draw|mill|damage|win/i.test(lower) ? "damage_or_value_conversion" : null,
  };
}

function isKorvoldStyleVagueLoop(plan: string): boolean {
  return /^recursive permanent loop$/i.test(plan.trim()) || (/^[\w\s]+loop$/i.test(plan.trim()) && !/commander damage|combat damage|21|voltron|connect/i.test(plan));
}

export function decomposeVagueWinHypothesisV417(blueprint: BrewBlueprintV417): VagueWinDecompositionV417[] {
  return blueprint.winArchitecture.map((plan) => {
    const research = isWinResearchableV417(plan.plan);
    const winType = research.type;

    if (winType === "COMBAT_CLOCK" && research.researchable) {
      return {
        planId: plan.planId,
        originalPlan: plan.plan,
        vague: false,
        researchable: true,
        winType,
        ...inferFromPlan(plan.plan),
        verdict: "RESEARCHABLE_COMBAT_CLOCK",
        functionalRequirements: plan.requiredFunctions,
      };
    }

    if (!research.vague && research.researchable) {
      return {
        planId: plan.planId,
        originalPlan: plan.plan,
        vague: false,
        researchable: true,
        winType,
        ...inferFromPlan(plan.plan),
        verdict: "ALREADY_CONCRETE",
        functionalRequirements: plan.requiredFunctions,
      };
    }

    if (isKorvoldStyleVagueLoop(plan.plan)) {
      return {
        planId: plan.planId,
        originalPlan: plan.plan,
        vague: true,
        researchable: false,
        winType,
        ...inferFromPlan(plan.plan),
        verdict: "CREATIVE_REVISION_REQUIRED",
        functionalRequirements: plan.requiredFunctions,
      };
    }

    const inferred = inferFromPlan(plan.plan);
    const concreteEnough =
      Boolean(inferred.resourceProduced) &&
      Boolean(inferred.resourceConsumed) &&
      Boolean(inferred.repetitionLoop) &&
      Boolean(inferred.winConversion);

    const functionalRequirements = concreteEnough
      ? ["RESOURCE_PRODUCTION", "RESOURCE_CONSUMER", "ENGINE_ENABLER", "WIN_COMPONENT", ...plan.requiredFunctions]
      : plan.requiredFunctions;

    return {
      planId: plan.planId,
      originalPlan: plan.plan,
      vague: research.vague,
      researchable: concreteEnough || research.researchable,
      winType,
      ...inferred,
      verdict: concreteEnough ? "DECOMPOSED" : research.researchable ? "ALREADY_CONCRETE" : "CREATIVE_REVISION_REQUIRED",
      functionalRequirements: [...new Set(functionalRequirements)],
    };
  });
}

export function vagueWinBlocksAssemblyV417(blueprint: BrewBlueprintV417): {
  blocked: boolean;
  failure: AssemblyFailureStateV417 | null;
  decompositions: VagueWinDecompositionV417[];
} {
  const decompositions = decomposeVagueWinHypothesisV417(blueprint);

  for (const plan of blueprint.winArchitecture) {
    if (isKorvoldStyleVagueLoop(plan.plan)) {
      return { blocked: true, failure: "CREATIVE_REVISION_REQUIRED", decompositions };
    }
  }

  const hasResearchableWin = decompositions.some(
    (d) => d.verdict === "RESEARCHABLE_COMBAT_CLOCK" || d.verdict === "ALREADY_CONCRETE" || d.verdict === "DECOMPOSED",
  );
  if (hasResearchableWin) {
    return { blocked: false, failure: null, decompositions };
  }

  const needsCreative = decompositions.some((d) => d.verdict === "CREATIVE_REVISION_REQUIRED");
  if (needsCreative) {
    return { blocked: true, failure: "CREATIVE_REVISION_REQUIRED", decompositions };
  }

  const unresolved = decompositions.some((d) => d.vague && !d.researchable && d.verdict !== "RESEARCHABLE_COMBAT_CLOCK");
  if (unresolved) {
    return { blocked: true, failure: "WIN_ARCHITECTURE_UNRESOLVED", decompositions };
  }

  return { blocked: false, failure: null, decompositions };
}

export function applyVagueWinDecompositionV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const decompositions = decomposeVagueWinHypothesisV417(blueprint);
  const winArchitecture = blueprint.winArchitecture.map((plan) => {
    const deco = decompositions.find((d) => d.planId === plan.planId);
    if (!deco || deco.verdict === "CREATIVE_REVISION_REQUIRED") return plan;
    if (deco.verdict === "RESEARCHABLE_COMBAT_CLOCK" || deco.verdict === "ALREADY_CONCRETE") {
      return { ...plan, status: "PARTIAL" as const, mechanicallyVerified: false };
    }
    if (deco.verdict !== "DECOMPOSED") return plan;
    return {
      ...plan,
      requiredFunctions: deco.functionalRequirements,
      status: "PARTIAL" as const,
      mechanicallyVerified: false,
    };
  });
  return { ...blueprint, winArchitecture };
}
