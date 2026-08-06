import type { CommanderClassification } from "./commander-classification";

/** Production commander paths must not reference legalCommander. */
const FORBIDDEN = /\blegalCommander\b/;

export const PRODUCTION_COMMANDER_PATHS = [
  "src/lib/store-inventory/clerk-tools/get-verified-commander-candidates.ts",
  "src/lib/store-inventory/clerk-tools/commander-eligibility.ts",
  "src/lib/store-inventory/clerk-tools/commander-recommendations.ts",
  "src/lib/store-inventory/clerk-tools/commander-theme-match.ts",
  "src/lib/store-inventory/clerk-tools/magic-commander-inventory.ts",
  "src/lib/store-inventory/clerk-tools/card-catalog.ts",
  "src/lib/store-inventory/clerk-tools/scryfall-lookup-service.ts",
  "src/lib/store-inventory/simple-clerk/simple-card-fact.ts",
  "src/lib/store-inventory/simple-clerk/simple-clerk-pipeline.ts",
  "src/lib/deck-builder/deck-builder-service.ts",
  "src/lib/deck-builder/commander-validation.ts",
  "src/lib/store-inventory/clerk-tools/commander-deck-builder.ts",
  "src/lib/store-inventory/clerk-tools/deck-build-planner.ts",
];

export function assertNoLegalCommanderInProductionPaths(
  readFile: (path: string) => string,
): string[] {
  const violations: string[] = [];
  for (const rel of PRODUCTION_COMMANDER_PATHS) {
    const content = readFile(rel);
    if (FORBIDDEN.test(content)) {
      violations.push(rel);
    }
  }
  return violations;
}

export function isSoleCommanderCandidate(
  classification: CommanderClassification | null | undefined,
): boolean {
  return classification?.canBeSoleCommander === true;
}

export function isCommandZoneParticipant(
  classification: CommanderClassification | null | undefined,
): boolean {
  return classification?.canBePartOfCommandZone === true;
}
