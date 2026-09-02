/**
 * Professor v4.17 Slice 5 — mana base after structural closure.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { recomputeBlueprintValidationV417, recomputePhysicalSlotBudgetV417 } from "./professor-brew-blueprint-v4-17-v1";
import { discoverCatalogLandsV48 } from "./professor-mana-base-v4-8-v1";
import { buildProfessorManaBaseLandNamesV48 } from "./professor-brew-deck-list-v4-3-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";

export const PROFESSOR_BREW_BLUEPRINT_MANA_V4_17_V1_VERSION = "professor-brew-blueprint-mana-v4-17-v1";

function averageMv(blueprint: BrewBlueprintV417): number {
  if (blueprint.selectedCards.length === 0) return blueprint.commander.manaValue ?? 3;
  const catalogMv = blueprint.selectedCards.length;
  return catalogMv > 0
    ? blueprint.selectedCards.reduce((s, c) => s + 3, 0) / catalogMv
    : blueprint.commander.manaValue ?? 3;
}

function targetLandCount(blueprint: BrewBlueprintV417): number {
  const bracket = blueprint.userIntent.bracket;
  const avgMv = averageMv(blueprint);
  let lands = bracket >= 4 ? 35 : bracket === 3 ? 34 : 33;
  if (avgMv >= 3.5) lands += 1;
  if (avgMv <= 2.5 && bracket >= 4) lands -= 1;
  return Math.min(38, Math.max(32, lands));
}

export function appendManaBaseForBlueprintV417(args: {
  blueprint: BrewBlueprintV417;
  catalog: DeckResolutionCatalog;
  landTargetOverride?: number;
}): BrewBlueprintV417 {
  const landTarget = args.landTargetOverride ?? targetLandCount(args.blueprint);
  const excludeNames = new Set([
    normalizeOracleName(args.blueprint.commander.name),
    ...args.blueprint.selectedCards.map((c) => normalizeOracleName(c.name)),
  ]);

  const catalogLands = discoverCatalogLandsV48({
    catalog: args.catalog,
    colorIdentity: args.blueprint.commander.colorIdentity,
    excludeNames,
    maxCount: landTarget,
  });

  const selectedLandOracleIds = catalogLands.map((c) => c.oracleId);
  const selectedLandNames = catalogLands.map((c) => c.canonicalName);
  const existingNames = new Set([...excludeNames, ...selectedLandNames.map((n) => normalizeOracleName(n))]);

  const fallback = buildProfessorManaBaseLandNamesV48({
    colorIdentity: args.blueprint.commander.colorIdentity,
    existingNames: [...existingNames],
    count: landTarget - selectedLandOracleIds.length,
  });

  const manaPlan = {
    ...args.blueprint.manaPlan,
    landTarget,
    colorRequirements: Object.fromEntries(args.blueprint.commander.colorIdentity.map((c) => [c, 1])),
    selectedLands: [...selectedLandNames, ...fallback],
  };

  const next: BrewBlueprintV417 = {
    ...args.blueprint,
    manaPlan,
    physicalSlotBudget: {
      ...args.blueprint.physicalSlotBudget,
      expectedLands: landTarget,
      selectedLands: manaPlan.selectedLands.length,
      remainingLandSlots: Math.max(0, landTarget - manaPlan.selectedLands.length),
    },
  };
  next.physicalSlotBudget = recomputePhysicalSlotBudgetV417(next);
  next.validation = recomputeBlueprintValidationV417(next);
  return next;
}

export function libraryOracleIdsV417(blueprint: BrewBlueprintV417): string[] {
  const nonlands = blueprint.selectedCards.map((c) => c.oracleId);
  const lands = blueprint.manaPlan.selectedLands;
  return [...nonlands, ...lands.map((name) => `land:${normalizeOracleName(name)}`)];
}

export function libraryCountV417(blueprint: BrewBlueprintV417): number {
  return blueprint.selectedCards.length + blueprint.manaPlan.selectedLands.length;
}

export function isLegal99V417(blueprint: BrewBlueprintV417): boolean {
  return libraryCountV417(blueprint) === COMMANDER_DECK_LIBRARY_SIZE_V47;
}
