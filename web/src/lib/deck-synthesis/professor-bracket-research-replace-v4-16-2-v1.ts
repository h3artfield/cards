/**
 * Professor v4.16.2 — bracket research replacements when structural slots are full.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commitReplaceMutationV4161 } from "./professor-mutation-integrity-v4-16-1-v1";
import type { BracketPowerSearchReportV416 } from "./professor-bracket-power-search-mission-v4-16-v1";
import {
  executeBracketPowerSearchMissionV416,
  planPowerSearchMissionsV416,
  type BracketPowerSearchHistoryV416,
} from "./professor-bracket-power-search-mission-v4-16-v1";
import { rankOpportunityCostCandidatesV4163 } from "./professor-opportunity-cost-v4-16-3-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { BracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import { recomputeBracketNativeStateV416, type ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";

export const PROFESSOR_BRACKET_RESEARCH_REPLACE_V4_16_2_V1_VERSION =
  "professor-bracket-research-replace-v4-16-2-v1";

export function runBracketResearchReplacePassV4162(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  charter: DeckCharterV45;
  colorIdentity: string[];
  bracket: CommanderBracket;
  commanderName: string;
  maxReplacements?: number;
}): ProfessorCouncilStateV47 {
  const contract = args.state.bracketConstructionContractV416;
  const portfolio = args.state.bracketPowerPortfolioV416;
  if (!contract || !portfolio) return args.state;

  let state = args.state;
  const history: BracketPowerSearchHistoryV416 = state.bracketPowerSearchHistoryV416 ?? {
    candidatesAlreadyConsidered: [],
    candidatesAlreadySelected: [],
    candidatesAlreadyRejected: [],
    completedMissionKinds: [],
    gameChangerReviewComplete: false,
  };

  const missions = planPowerSearchMissionsV416({ portfolio, contract, history });
  const mission = missions[0];
  if (mission) {
    const result = executeBracketPowerSearchMissionV416({
      mission,
      catalog: args.catalog,
      charter: args.charter,
      colorIdentity: args.colorIdentity,
      bracket: args.bracket,
      powerPlan: state.bracketPowerPlanV410 ?? null,
      deckNeeds: state.deckNeeds,
      selectedCards: state.selectedCards,
      revision: state.assemblyRevision + 1,
      history,
    });
    state = {
      ...state,
      bracketPowerSearchReportsV416: [...(state.bracketPowerSearchReportsV416 ?? []), result.report],
      bracketPowerSearchHistoryV416: result.history,
      candidatePool: [...result.cards, ...state.candidatePool],
    };
  }

  const opp = rankOpportunityCostCandidatesV4163({
    selectedCards: state.selectedCards,
    charter: args.charter,
    requestedBracket: args.bracket,
  });
  const cuts = opp.bottomSlots.filter((s) => s.recommendation === "REPLACE").slice(0, args.maxReplacements ?? 2);
  let selectedCards = [...state.selectedCards];
  const mutationRecords = [...(state.mutationRecordsV4161 ?? [])];

  for (const cutSlot of cuts) {
    const cutIdx = selectedCards.findIndex((c) => c.name === cutSlot.currentCard);
    if (cutIdx < 0) continue;
    const add = state.candidatePool.find(
      (c) => !selectedCards.some((s) => s.oracleId && s.oracleId === c.oracleId) && c.name !== cutSlot.currentCard,
    );
    if (!add) continue;
    const replaced = commitReplaceMutationV4161({
      selectedCards,
      cut: selectedCards[cutIdx]!,
      add,
      revision: state.assemblyRevision + 1,
    });
    if (!replaced.pass) continue;
    selectedCards = replaced.selectedCards;
    mutationRecords.push(replaced.record);
    state.candidatePool = state.candidatePool.filter((c) => c.cardId !== add.cardId);
  }

  state = {
    ...state,
    selectedCards,
    mutationRecordsV4161: mutationRecords,
    assemblyRevision: state.assemblyRevision + 1,
    buildPhase: "RESEARCHING",
  };

  return recomputeBracketNativeStateV416({
    state,
    catalog: args.catalog,
    bracket: args.bracket,
    commanderName: args.commanderName,
    requireFullLibrary: true,
    discoveryExhausted: state.bracketResearchExhaustedV4162 ?? false,
  });
}

export function markBracketResearchExhaustedV4162(state: ProfessorCouncilStateV47): ProfessorCouncilStateV47 {
  return { ...state, bracketResearchExhaustedV4162: true };
}
