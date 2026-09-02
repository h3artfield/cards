/**
 * Deck needs v4.16 — merge strategy needs + bracket power needs from construction contract.
 */
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { BracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import { buildInitialDeckNeedsV47, type DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import { bracketPowerNeedsToDeckNeedsV416 } from "./professor-bracket-power-search-mission-v4-16-v1";

export const PROFESSOR_DECK_NEEDS_V4_16_V1_VERSION = "professor-deck-needs-v4-16-v1";

export function buildInitialDeckNeedsV416(args: {
  charter: DeckCharterV45;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  contract: BracketConstructionContractV416;
}): DeckNeedV47[] {
  const strategyNeeds = buildInitialDeckNeedsV47({
    charter: args.charter,
    pass1: args.pass1,
    theory: args.theory,
  });
  const bracketNeeds = bracketPowerNeedsToDeckNeedsV416({ contract: args.contract });

  const seen = new Set<string>();
  const merged: DeckNeedV47[] = [];
  for (const need of [...strategyNeeds, ...bracketNeeds]) {
    if (seen.has(need.needId)) continue;
    seen.add(need.needId);
    merged.push(need);
  }
  return merged;
}

export function buildWinArchitectureDeckNeedsV416(args: {
  contract: BracketConstructionContractV416;
  primaryWinArchitecture: string;
  secondaryWinArchitecture?: string;
  accessPlan: string;
  protectionPlan?: string;
}): DeckNeedV47[] {
  const needs: DeckNeedV47[] = [
    {
      needId: "need-win-architecture-primary",
      category: "WIN_PATH",
      role: "finisher",
      reason: args.primaryWinArchitecture,
      source: "BRACKET_CONTRACT",
      requiredFunctions: ["finisher"],
      preferredFunctions: ["finisher"],
      requiredMechanics: [],
      preferredMechanics: [],
      desiredProducedResources: [],
      desiredConsumedResources: [],
      desiredEvents: [],
      urgency: "HIGH",
      status: "OPEN",
      conceptText: args.primaryWinArchitecture,
      packageName: "primaryWinArchitecture",
    },
    {
      needId: "need-access-plan",
      category: "ROLE_COMPRESSION",
      role: "card-advantage",
      reason: args.accessPlan,
      source: "BRACKET_CONTRACT",
      requiredFunctions: ["card-advantage"],
      preferredFunctions: ["card-advantage"],
      requiredMechanics: [],
      preferredMechanics: [],
      desiredProducedResources: [],
      desiredConsumedResources: [],
      desiredEvents: [],
      urgency: args.contract.accessArchitectureRequired ? "HIGH" : "MEDIUM",
      status: "OPEN",
      conceptText: args.accessPlan,
      packageName: "accessPlan",
    },
  ];
  if (args.secondaryWinArchitecture) {
    needs.push({
      needId: "need-win-architecture-secondary",
      category: "WIN_PATH",
      role: "finisher",
      reason: args.secondaryWinArchitecture,
      source: "BRACKET_CONTRACT",
      requiredFunctions: ["finisher"],
      preferredFunctions: ["finisher"],
      requiredMechanics: [],
      preferredMechanics: [],
      desiredProducedResources: [],
      desiredConsumedResources: [],
      desiredEvents: [],
      urgency: "MEDIUM",
      status: "OPEN",
      conceptText: args.secondaryWinArchitecture,
      packageName: "secondaryWinArchitecture",
    });
  }
  if (args.protectionPlan) {
    needs.push({
      needId: "need-protection-plan",
      category: "PROTECTION",
      role: "protection",
      reason: args.protectionPlan,
      source: "BRACKET_CONTRACT",
      requiredFunctions: ["protection"],
      preferredFunctions: ["protection"],
      requiredMechanics: [],
      preferredMechanics: [],
      desiredProducedResources: [],
      desiredConsumedResources: [],
      desiredEvents: [],
      urgency: "MEDIUM",
      status: "OPEN",
      conceptText: args.protectionPlan,
      packageName: "protectionPlan",
    });
  }
  return needs;
}

export function inferWinArchitectureFromCharterV416(args: {
  charter: DeckCharterV45;
  contract: BracketConstructionContractV416;
}): {
  primaryWinArchitecture: string;
  secondaryWinArchitecture: string;
  accessPlan: string;
  protectionPlan: string;
  threatWindowTarget: string;
} {
  const strategy = args.charter.primaryStrategy;
  const bracket = args.contract.requestedBracket;
  return {
    primaryWinArchitecture:
      bracket >= 4
        ? `Compact ${strategy} win line — fewest pieces that close the game`
        : `Strong ${strategy} big-turn win`,
    secondaryWinArchitecture:
      bracket >= 4 ? `Redundant ${strategy} finisher via combat or incremental drain` : `Grind via ${strategy}`,
    accessPlan:
      bracket >= 4
        ? "Tutors + redundancy to reach engine, win, protection, recovery"
        : bracket === 3
          ? "Selective tutors and redundancy without cEDH density"
          : "Thematic redundancy and draw",
    protectionPlan: bracket >= 4 ? "Instant protection for key turns and combo pieces" : "Some protection for commander",
    threatWindowTarget: args.contract.targetThreatWindow,
  };
}
