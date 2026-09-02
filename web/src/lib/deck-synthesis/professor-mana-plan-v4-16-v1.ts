/**
 * Mana Plan v4.16 — reserve land structure during build, not pad-to-99 at the end.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";

export const PROFESSOR_MANA_PLAN_V4_16_V1_VERSION = "professor-mana-plan-v4-16-v1";

export type ManaPlanV416 = {
  version: typeof PROFESSOR_MANA_PLAN_V4_16_V1_VERSION;
  requestedBracket: CommanderBracket;
  expectedLandCount: number;
  reservedLandSlots: number;
  structuralNonLandTarget: number;
  expectedFastManaSlots: number;
  expectedRampSlots: number;
  maxTaplandTolerance: "NONE" | "LOW" | "MEDIUM";
  commanderMv: number;
  colorRequirements: string[];
  untappedSourcePriority: "HIGH" | "MEDIUM" | "LOW";
  curveTarget: string;
  slotsRemainingForLands: (currentNonLandCount: number) => number;
  summary: string;
};

function baseLandCount(bracket: CommanderBracket, avgMv: number): number {
  let lands = bracket >= 4 ? 35 : bracket === 3 ? 34 : 33;
  if (avgMv >= 3.5) lands += 1;
  if (avgMv <= 2.5 && bracket >= 4) lands -= 1;
  return Math.min(38, Math.max(32, lands));
}

export function buildManaPlanV416(args: {
  bracket: CommanderBracket;
  contract: BracketConstructionContractV416;
  colorIdentity: string[];
  commanderMv?: number;
  selectedCards?: CouncilCardV46[];
}): ManaPlanV416 {
  const selected = args.selectedCards ?? [];
  const nonlands = selected.filter((c) => c.category !== "land");
  const avgMv =
    nonlands.length > 0
      ? nonlands.reduce((s, c) => s + (c.manaValue ?? 3), 0) / nonlands.length
      : args.commanderMv ?? 3;
  const expectedLandCount = baseLandCount(args.bracket, avgMv);
  const reservedLandSlots = expectedLandCount;
  const structuralNonLandTarget = COMMANDER_DECK_LIBRARY_SIZE_V47 - reservedLandSlots;

  return {
    version: PROFESSOR_MANA_PLAN_V4_16_V1_VERSION,
    requestedBracket: args.bracket,
    expectedLandCount,
    reservedLandSlots,
    structuralNonLandTarget,
    expectedFastManaSlots: args.bracket >= 4 ? 6 : args.bracket === 3 ? 3 : 1,
    expectedRampSlots: args.bracket >= 4 ? 12 : args.bracket === 3 ? 9 : 7,
    maxTaplandTolerance: args.bracket >= 4 ? "LOW" : args.bracket === 3 ? "MEDIUM" : "MEDIUM",
    commanderMv: args.commanderMv ?? 3,
    colorRequirements: args.colorIdentity,
    untappedSourcePriority: args.bracket >= 4 ? "HIGH" : "MEDIUM",
    curveTarget: args.bracket >= 4 ? "Low curve with premium acceleration" : "Balanced curve",
    slotsRemainingForLands: (currentNonLandCount: number) =>
      Math.max(0, reservedLandSlots - (COMMANDER_DECK_LIBRARY_SIZE_V47 - currentNonLandCount - reservedLandSlots)),
    summary: `Reserve ${reservedLandSlots} land slots — build ${structuralNonLandTarget} nonlands before mana base`,
  };
}

export function resolveStructuralTargetV416(manaPlan: ManaPlanV416 | null | undefined): number {
  return manaPlan?.structuralNonLandTarget ?? 85;
}

export function recomputeManaPlanV416(args: {
  prior: ManaPlanV416;
  selectedCards: CouncilCardV46[];
  commanderMv?: number;
}): ManaPlanV416 {
  return buildManaPlanV416({
    bracket: args.prior.requestedBracket,
    contract: {
      requestedBracket: args.prior.requestedBracket,
    } as BracketConstructionContractV416,
    colorIdentity: args.prior.colorRequirements,
    commanderMv: args.commanderMv ?? args.prior.commanderMv,
    selectedCards: args.selectedCards,
  });
}
