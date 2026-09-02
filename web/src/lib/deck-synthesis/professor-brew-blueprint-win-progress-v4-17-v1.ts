/**
 * Professor v4.17 Slice 5 — win architecture progression during assembly.
 */
import type { BrewBlueprintV417, WinArchitectureBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { classifyWinArchitectureTypeV417, isWinResearchableV417 } from "./professor-win-architecture-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_WIN_PROGRESS_V4_17_V1_VERSION = "professor-brew-blueprint-win-progress-v4-17-v1";

function winFunctionsCovered(blueprint: BrewBlueprintV417, plan: WinArchitectureBlueprintV417): number {
  const needed = plan.requiredFunctions;
  if (needed.length === 0) return blueprint.selectedCards.length > 0 ? 1 : 0;
  const selectedFns = new Set(blueprint.selectedCards.flatMap((c) => c.satisfiedFunctions));
  return needed.filter((fn) => selectedFns.has(fn as never)).length;
}

function combatClockVerified(blueprint: BrewBlueprintV417, plan: WinArchitectureBlueprintV417): boolean {
  const type = classifyWinArchitectureTypeV417(plan.plan);
  if (type !== "COMBAT_CLOCK") return false;
  const hasWin = blueprint.selectedCards.some((c) => c.satisfiedFunctions.includes("WIN_COMPONENT"));
  const hasProtection = blueprint.selectedCards.some((c) => c.satisfiedFunctions.includes("PROTECTION"));
  const hasAccess = blueprint.selectedCards.some((c) => c.satisfiedFunctions.includes("ACCESS"));
  return hasWin && (hasProtection || hasAccess) && blueprint.selectedCards.length >= 12;
}

export function refreshWinArchitectureV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const winArchitecture = blueprint.winArchitecture.map((plan) => {
    const research = isWinResearchableV417(plan.plan);
    if (research.vague && !research.researchable) {
      return { ...plan, status: "HYPOTHESIZED" as const, mechanicallyVerified: false };
    }
    const covered = winFunctionsCovered(blueprint, plan);
    const needed = Math.max(1, plan.requiredFunctions.length);
    if (combatClockVerified(blueprint, plan) || (covered >= needed && blueprint.selectedCards.length >= 20)) {
      return { ...plan, status: "VERIFIED" as const, mechanicallyVerified: true };
    }
    if (covered > 0) {
      return { ...plan, status: "PARTIAL" as const, mechanicallyVerified: false };
    }
    return plan;
  });

  return { ...blueprint, winArchitecture };
}

export function winArchitectureResolvedV417(blueprint: BrewBlueprintV417): boolean {
  if (blueprint.winArchitecture.length === 0) return true;
  return blueprint.winArchitecture.some((w) => w.status === "VERIFIED" || w.status === "PARTIAL");
}

export function winArchitectureVerifiedV417(blueprint: BrewBlueprintV417): boolean {
  return blueprint.winArchitecture.some((w) => w.status === "VERIFIED" && w.mechanicallyVerified);
}
