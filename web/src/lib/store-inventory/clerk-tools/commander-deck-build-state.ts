import type { EdhrecCardRecommendation } from "../../deck-builder/types";
import type { ClerkDeckCard } from "../clerk-types";
import type { MagicDeckCategory } from "./commander-deck-builder";

export const COMMANDER_DECK_BUILD_STAGES = [
  { id: "commander", label: "Commander" },
  { id: "ramp", label: "Ramp & mana" },
  { id: "draw", label: "Card draw" },
  { id: "interaction", label: "Interaction" },
  { id: "synergy", label: "Synergy & wincons" },
  { id: "lands", label: "Mana base" },
  { id: "fill", label: "Rounding out" },
] as const;

export type CommanderDeckBuildStageId =
  (typeof COMMANDER_DECK_BUILD_STAGES)[number]["id"];

export interface CommanderDeckBuildSession {
  version: 1;
  resolvedRequestId?: string;
  commanderSelectionPolicy?: import("../resolved-clerk-request").CommanderSelectionPolicy;
  commanderOracleId?: string;
  commanderName: string;
  commanderColors: string[];
  commanderScryfallId?: string;
  budget?: number;
  strategy: string;
  /** Next stage to run (0 = commander, then ramp, …). */
  stageIndex: number;
  lines: ClerkDeckCard[];
  missingSlots: string[];
  usedNames: string[];
  usedInventory: Record<string, number>;
  spent: number;
  mainCount: number;
  categoryCounts: Record<MagicDeckCategory, number>;
  edhrecRecommendations: EdhrecCardRecommendation[];
  ragNotes?: string;
}

export function emptyCategoryCounts(): Record<MagicDeckCategory, number> {
  return {
    commander: 0,
    land: 0,
    ramp: 0,
    draw: 0,
    interaction: 0,
    protection: 0,
    synergy: 0,
    finisher: 0,
    other: 0,
  };
}

export function createDeckBuildSession(input: {
  resolvedRequestId?: string;
  commanderSelectionPolicy?: import("../resolved-clerk-request").CommanderSelectionPolicy;
  commanderOracleId?: string;
  commanderName: string;
  commanderColors: string[];
  commanderScryfallId?: string;
  budget?: number;
  strategy: string;
  edhrecRecommendations: EdhrecCardRecommendation[];
  ragNotes?: string;
}): CommanderDeckBuildSession {
  return {
    version: 1,
    resolvedRequestId: input.resolvedRequestId,
    commanderSelectionPolicy: input.commanderSelectionPolicy,
    commanderOracleId: input.commanderOracleId,
    commanderName: input.commanderName,
    commanderColors: input.commanderColors,
    commanderScryfallId: input.commanderScryfallId,
    budget: input.budget,
    strategy: input.strategy,
    stageIndex: 0,
    lines: [],
    missingSlots: [],
    usedNames: [],
    usedInventory: {},
    spent: 0,
    mainCount: 0,
    categoryCounts: emptyCategoryCounts(),
    edhrecRecommendations: input.edhrecRecommendations,
    ragNotes: input.ragNotes,
  };
}
