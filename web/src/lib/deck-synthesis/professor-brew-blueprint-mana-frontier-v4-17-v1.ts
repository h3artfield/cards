/**
 * Professor v4.17 Slice 5.4 — dynamic nonland/land frontier (no universal 64 closure).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import {
  mandatoryStructureSatisfiedV417,
  preferredCoverageRemainingV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { openFunctionalDensityCountV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { openPackageDensityCountV417, computePackageDensityStatesV417 } from "./professor-brew-blueprint-package-density-v4-17-v1";
import { selectedNonlandsFromCanonicalTruthV1 } from "./professor-canonical-deck-partition-v1";

export const PROFESSOR_BREW_BLUEPRINT_MANA_FRONTIER_V4_17_V1_VERSION =
  "professor-brew-blueprint-mana-frontier-v4-17-v1";

export type NonlandManaFrontierV417 = {
  version: typeof PROFESSOR_BREW_BLUEPRINT_MANA_FRONTIER_V4_17_V1_VERSION;
  selectedNonlands: number;
  minimumNonlandsRequiredByStructure: number;
  mandatoryStructureSatisfied: boolean;
  candidateLandRange: { min: number; preferred: number; max: number };
  currentCurve: { averageMv: number; rampCount: number; highCmcCount: number };
  colorDemand: Record<string, number>;
  commanderCost: number;
  accelerationProfile: string;
  utilityLandNeeds: string[];
  nextNonlandMarginalUtility: number;
  nextLandMarginalUtility: number;
  recommendation: "ADD_NONLAND" | "ADD_LAND" | "STRUCTURE_REPAIR_REQUIRED";
  dynamicNonlandCap: number;
};

function averageMv(blueprint: BrewBlueprintV417): number {
  if (blueprint.selectedCards.length === 0) return blueprint.commander.manaValue ?? 3;
  const total = blueprint.selectedCards.reduce((s, c) => {
    const mv = c.satisfiedFunctions.includes("ACCELERATION") ? 2 : 3;
    return s + mv;
  }, 0);
  return total / blueprint.selectedCards.length;
}

function rampCount(blueprint: BrewBlueprintV417): number {
  return blueprint.selectedCards.filter((c) => c.satisfiedFunctions.includes("ACCELERATION")).length;
}

function landBudgetFromSol(blueprint: BrewBlueprintV417): { min: number; preferred: number; max: number } | null {
  for (const budget of blueprint.functionalBudgets) {
    const key = String(budget.category ?? budget.function ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (key !== "lands") continue;
    const minimum = Number(budget.minimum ?? 35);
    const maximum = Number(budget.maximum ?? minimum);
    return { min: Math.max(32, minimum - 2), preferred: minimum, max: Math.min(38, maximum + 2) };
  }
  return null;
}

function computeLandRange(blueprint: BrewBlueprintV417): { min: number; preferred: number; max: number } {
  const sol = landBudgetFromSol(blueprint);
  const bracket = blueprint.userIntent.bracket;
  const avgMv = averageMv(blueprint);
  const ramp = rampCount(blueprint);
  let preferred = sol?.preferred ?? (bracket >= 4 ? 35 : bracket === 3 ? 34 : 33);
  if (avgMv >= 3.5) preferred += 1;
  if (avgMv <= 2.5 && bracket >= 4) preferred -= 1;
  if (ramp >= 12) preferred -= 1;
  if (ramp <= 6 && bracket >= 4) preferred += 1;
  preferred = Math.min(38, Math.max(32, preferred));
  return {
    min: Math.max(32, preferred - 2),
    preferred,
    max: Math.min(38, preferred + 2),
  };
}

export function computeNonlandManaFrontierV417(args: {
  blueprint: BrewBlueprintV417;
  catalog?: DeckResolutionCatalog | null;
  nextNonlandMarginalUtility?: number;
}): NonlandManaFrontierV417 {
  const blueprint = args.blueprint;
  const selectedNonlands = selectedNonlandsFromCanonicalTruthV1({
    blueprint,
    catalog: args.catalog ?? null,
    fallbackCount: blueprint.selectedCards.length,
  });
  const mandatorySatisfied = mandatoryStructureSatisfiedV417(blueprint, args.catalog ?? null);
  const landRange = computeLandRange(blueprint);
  const dynamicNonlandCap = COMMANDER_DECK_LIBRARY_SIZE_V47 - landRange.preferred;
  const avgMv = averageMv(blueprint);
  const ramp = rampCount(blueprint);
  const highCmcCount = blueprint.selectedCards.filter((c) => !c.satisfiedFunctions.includes("ACCELERATION")).length;

  const packageFloorsOpen = computePackageDensityStatesV417(blueprint).filter((d) => d.status === "BELOW_MINIMUM").length;
  const openMandatory =
    blueprint.openRequirements.filter(
      (r) =>
        (r.status === "OPEN" || r.status === "PARTIAL") &&
        !r.requirementId.startsWith("flex-") &&
        r.family !== "FUNCTIONAL_DENSITY" &&
        r.family !== "PACKAGE_DENSITY",
    ).length +
    openFunctionalDensityCountV417(blueprint) +
    openPackageDensityCountV417(blueprint) +
    packageFloorsOpen;

  const minimumNonlandsRequiredByStructure = Math.max(
    selectedNonlands,
    blueprint.functionalBudgets
      .filter((b) => {
        const key = String(b.category ?? b.function ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        return key !== "lands" && key !== "flexslots";
      })
      .reduce((sum, b) => sum + Number(b.minimum ?? 0), 0),
  );

  const nextNonlandMarginalUtility = args.nextNonlandMarginalUtility ?? 0;
  const slotsForLands = COMMANDER_DECK_LIBRARY_SIZE_V47 - selectedNonlands;
  const nextLandMarginalUtility =
    mandatorySatisfied && openMandatory === 0 && nextNonlandMarginalUtility <= 0 && slotsForLands >= landRange.min
      ? landRange.preferred - (blueprint.manaPlan.selectedLands.length || 0)
      : 0;

  let recommendation: NonlandManaFrontierV417["recommendation"] = "ADD_NONLAND";
  if (!mandatorySatisfied || openMandatory > 0) {
    recommendation = "STRUCTURE_REPAIR_REQUIRED";
  } else if (
    nextNonlandMarginalUtility <= 0 &&
    preferredCoverageRemainingV417(blueprint) === 0 &&
    selectedNonlands >= dynamicNonlandCap - 2
  ) {
    recommendation = "ADD_LAND";
  } else if (nextNonlandMarginalUtility <= 0 && mandatorySatisfied && openMandatory === 0) {
    recommendation = "ADD_LAND";
  }

  const accelerationProfile =
    ramp >= 10 ? "heavy-ramp" : ramp >= 7 ? "moderate-ramp" : ramp >= 4 ? "light-ramp" : "minimal-ramp";

  return {
    version: PROFESSOR_BREW_BLUEPRINT_MANA_FRONTIER_V4_17_V1_VERSION,
    selectedNonlands,
    minimumNonlandsRequiredByStructure,
    mandatoryStructureSatisfied: mandatorySatisfied,
    candidateLandRange: landRange,
    currentCurve: { averageMv: avgMv, rampCount: ramp, highCmcCount },
    colorDemand: Object.fromEntries(blueprint.commander.colorIdentity.map((c) => [c, 1])),
    commanderCost: blueprint.commander.manaValue ?? 0,
    accelerationProfile,
    utilityLandNeeds: blueprint.manaPlan.utilityLands,
    nextNonlandMarginalUtility,
    nextLandMarginalUtility,
    recommendation,
    dynamicNonlandCap,
  };
}

export function shouldContinueNonlandAssemblyV417(
  blueprint: BrewBlueprintV417,
  frontier: NonlandManaFrontierV417,
): boolean {
  if (blueprint.selectedCards.length >= frontier.dynamicNonlandCap + 2) return false;
  if (frontier.recommendation === "ADD_LAND" && frontier.mandatoryStructureSatisfied) return false;
  if (blueprint.selectedCards.length >= COMMANDER_DECK_LIBRARY_SIZE_V47 - frontier.candidateLandRange.min) return false;
  return true;
}

export function syncPhysicalSlotBudgetToFrontierV417(
  blueprint: BrewBlueprintV417,
  frontier: NonlandManaFrontierV417,
): BrewBlueprintV417 {
  const expectedNonlands = frontier.dynamicNonlandCap;
  const expectedLands = frontier.candidateLandRange.preferred;
  const selectedNonlands = selectedNonlandsFromCanonicalTruthV1({
    blueprint,
    fallbackCount: blueprint.selectedCards.length,
  });
  return {
    ...blueprint,
    physicalSlotBudget: {
      expectedNonlands,
      selectedNonlands,
      remainingNonlandSlots: Math.max(0, expectedNonlands - selectedNonlands),
      expectedLands,
      selectedLands: blueprint.manaPlan.selectedLands.length,
      remainingLandSlots: Math.max(0, expectedLands - blueprint.manaPlan.selectedLands.length),
    },
    manaPlan: { ...blueprint.manaPlan, landTarget: expectedLands },
  };
}

export function evaluateDynamicNonlandClosureV417(
  blueprint: BrewBlueprintV417,
  frontier: NonlandManaFrontierV417,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!frontier.mandatoryStructureSatisfied) reasons.push("MANDATORY_STRUCTURE_OPEN");
  if (frontier.recommendation === "STRUCTURE_REPAIR_REQUIRED") reasons.push("STRUCTURE_REPAIR_REQUIRED");
  if (frontier.recommendation !== "ADD_LAND" && frontier.mandatoryStructureSatisfied) {
    reasons.push(`FRONTIER_NOT_LAND:${frontier.recommendation}`);
  }
  const libraryNonlands = blueprint.selectedCards.length;
  const expectedLands =
    frontier.recommendation === "ADD_LAND"
      ? COMMANDER_DECK_LIBRARY_SIZE_V47 - libraryNonlands
      : frontier.candidateLandRange.preferred;
  if (libraryNonlands + expectedLands !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    reasons.push(`SLOT_SUM:${libraryNonlands}+${expectedLands}!=${COMMANDER_DECK_LIBRARY_SIZE_V47}`);
  }
  return { valid: reasons.length === 0, reasons };
}
