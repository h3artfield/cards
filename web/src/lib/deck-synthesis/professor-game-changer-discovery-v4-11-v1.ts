/**
 * Dedicated Game Changer discovery v4.11.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
  type CommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  isCurrentlyCommanderLegal,
  type DeckResolutionCatalog,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import { scoreCandidateForBracketV410 } from "./professor-bracket-candidate-scoring-v4-10-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { loadCommanderBracketPolicyV49 } from "./professor-bracket-policy-v4-9-v1";

export const PROFESSOR_GAME_CHANGER_DISCOVERY_V4_11_V1_VERSION = "professor-game-changer-discovery-v4-11-v1";

export type GameChangerEvaluationV411 = {
  card: string;
  oracleId: string;
  role: string;
  reasonRelevant: string;
  deckNeedSatisfied: string | null;
  bracketPowerContribution: number;
  selected: boolean;
  rejectionReason: string | null;
};

let cachedGcSnapshot: CommanderGameChangerSnapshot | null = null;
let cachedGcOracleSet: Set<string> | null = null;

function gcSnapshot(): CommanderGameChangerSnapshot {
  if (!cachedGcSnapshot) cachedGcSnapshot = loadCommanderGameChangerSnapshot();
  return cachedGcSnapshot;
}

function gcOracleSet(): Set<string> {
  if (!cachedGcOracleSet) cachedGcOracleSet = gameChangerOracleIdSet(gcSnapshot());
  return cachedGcOracleSet;
}

export function getLegalRelevantGameChangersV411(args: {
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  deckNeeds: DeckNeedV47[];
  selectedCards: CouncilCardV46[];
  powerPlan: BracketPowerPlanV410 | null;
  maxEvaluate?: number;
}): GameChangerEvaluationV411[] {
  const gcIds = gcOracleSet();
  const selectedIds = new Set(args.selectedCards.map((c) => c.oracleId).filter(Boolean));
  const selectedGcCount = args.selectedCards.filter((c) => c.oracleId && gcIds.has(c.oracleId)).length;
  const cap = loadCommanderBracketPolicyV49(args.bracket).gameChangerMax;
  const primaryNeed = args.deckNeeds.find((n) => n.status === "OPEN") ?? args.deckNeeds[0];
  const evaluations: GameChangerEvaluationV411[] = [];

  for (const gcCard of gcSnapshot().cards) {
    if (!gcIds.has(gcCard.oracleId)) continue;
    const golden = args.catalog.byOracleId.get(gcCard.oracleId);
    if (!golden || !isCurrentlyCommanderLegal(golden)) continue;
    if (!commanderLegalInIdentity(golden.colorIdentity ?? [], args.colorIdentity)) continue;

    const profile = buildFunctionalCardProfileV47(golden);
    const alreadySelected = selectedIds.has(gcCard.oracleId);
    let bracketPowerContribution = 0;
    if (primaryNeed) {
      bracketPowerContribution = scoreCandidateForBracketV410({
        profile,
        need: primaryNeed,
        bracket: args.bracket,
        powerPlan: args.powerPlan,
      }).bracketPowerFit;
    }

    const charterMatch = args.charter
      ? profile.roles.some((r) =>
          args.charter!.primaryStrategy.toLowerCase().includes(r.replace("-", " ")) ||
          args.charter!.intendedWinPaths.some((p) => p.toLowerCase().includes(r.replace("-", " "))),
        )
      : false;

    let selected = alreadySelected;
    let rejectionReason: string | null = null;

    if (alreadySelected) {
      rejectionReason = null;
    } else if (cap !== null && selectedGcCount >= cap && !alreadySelected) {
      rejectionReason = `B${args.bracket} Game Changer cap (${cap}) reached`;
      selected = false;
    } else if (bracketPowerContribution < 2 && !charterMatch) {
      rejectionReason = "Game Changer status alone — insufficient charter/bracket fit for this deck";
      selected = false;
    } else if (golden.manaValue >= 6 && args.bracket >= 4) {
      rejectionReason = "Too slow for B4 efficiency target despite GC status";
      selected = false;
    } else {
      selected = bracketPowerContribution >= 2 || charterMatch;
      if (!selected) rejectionReason = "Does not improve this particular deck's power architecture";
    }

    evaluations.push({
      card: gcCard.canonicalName,
      oracleId: gcCard.oracleId,
      role: profile.roles.slice(0, 3).join("+") || "power",
      reasonRelevant: charterMatch
        ? `Aligns with charter (${args.charter?.primaryStrategy ?? "strategy"})`
        : `Bracket power contribution ${bracketPowerContribution}`,
      deckNeedSatisfied: primaryNeed?.conceptText ?? null,
      bracketPowerContribution,
      selected,
      rejectionReason,
    });
  }

  evaluations.sort((a, b) => b.bracketPowerContribution - a.bracketPowerContribution);
  return evaluations.slice(0, args.maxEvaluate ?? 24);
}
