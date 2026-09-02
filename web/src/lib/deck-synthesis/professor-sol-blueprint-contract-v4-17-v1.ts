/**
 * Professor v4.17 — Sol blueprint generation contract.
 */
import type {
  BracketContractBlueprintV417,
  BrewBlueprintV417,
  CommanderBlueprintV417,
  FunctionalBudgetV417,
  PackageBlueprintV417,
  StrategyBlueprintV417,
  UserIntentBlueprintV417,
  WinArchitectureBlueprintV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { bracketQualityContractV417, PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION } from "./professor-brew-blueprint-v4-17-v1";
import {
  auditBlueprintConsistencyV417,
  defaultConsistencyAuditV417,
  defaultSlotFeasibilityV417,
} from "./professor-blueprint-feasibility-v4-17-v1";

export const PROFESSOR_SOL_BLUEPRINT_CONTRACT_V4_17_V1_VERSION = "professor-sol-blueprint-contract-v4-17-v1";

export type SolBlueprintPromptInputV417 = {
  commander: CommanderBlueprintV417;
  semanticCommanderProfile?: Record<string, unknown>;
  commanderRag?: string[];
  packageStrategyRag?: string[];
  rulesContext?: string[];
  requestedBracket: number;
  userPreferences?: string[];
};

export type SolBlueprintOutputV417 = {
  strategy: StrategyBlueprintV417;
  bracketContract: BracketContractBlueprintV417;
  winArchitecture: WinArchitectureBlueprintV417[];
  packages: PackageBlueprintV417[];
  functionalBudgets: FunctionalBudgetV417[];
  researchSeeds: string[];
};

export const SOL_BLUEPRINT_SYSTEM_PROMPT_V417 = `You are GPT-5.6 Sol Creative Professor designing a Commander brew blueprint.

You receive canonical commander oracle data and semantic interpretation. Do NOT invent mechanical facts.

Design the optimal coherent architecture under the player's constraints.

Return JSON matching the schema with:
- strategicThesis, primaryStrategy, secondaryStrategy, commanderExploit, independentEngine, expectedPlayPattern
- strategicConcepts[] — strategic language to normalize (not new semantic facts)
- packages with requirementGroups (setup/recursion/payoff etc.), slot RANGES, required/preferred functions
- winArchitecture (HYPOTHESIZED only — VERIFIED requires mechanical verifier elsewhere)
- functionalBudgets as RANGES, not 64 frozen nonland slots
- bracketContract + bracketConstructionGuidance
- accessNeeds, protectionNeeds, weaknesses, strengths, dependencies
- researchSeeds[] — card name hypotheses ONLY; never selected cards

Do NOT return a 100-card decklist.`;

export function buildSolBlueprintUserPromptV417(input: SolBlueprintPromptInputV417): string {
  const lines = [
    `Commander: ${input.commander.name}`,
    `Color identity: ${input.commander.colorIdentity.join("") || "C"}`,
    `Oracle: ${input.commander.oracleText}`,
    `Requested bracket: B${input.requestedBracket}`,
    input.userPreferences?.length ? `User preferences:\n${input.userPreferences.join("\n")}` : "",
    input.commanderRag?.length ? `Commander RAG:\n${input.commanderRag.join("\n")}` : "",
    input.packageStrategyRag?.length ? `Package/strategy RAG:\n${input.packageStrategyRag.join("\n")}` : "",
    input.rulesContext?.length ? `Rules context:\n${input.rulesContext.join("\n")}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

export function mergeSolOutputIntoBlueprintV417(args: {
  commander: CommanderBlueprintV417;
  userIntent: UserIntentBlueprintV417;
  solOutput: SolBlueprintOutputV417;
  openRequirements: BrewBlueprintV417["openRequirements"];
  normalizedConcepts?: BrewBlueprintV417["normalizedConcepts"];
}): BrewBlueprintV417 {
  const bracket = args.userIntent.bracket;
  const blueprint: BrewBlueprintV417 = {
    version: PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION,
    commander: args.commander,
    userIntent: args.userIntent,
    bracketContract: {
      ...args.solOutput.bracketContract,
      qualityContract: bracketQualityContractV417(bracket),
    },
    strategy: {
      ...args.solOutput.strategy,
      researchSeeds: args.solOutput.researchSeeds,
    },
    normalizedConcepts: args.normalizedConcepts ?? [],
    winArchitecture: args.solOutput.winArchitecture,
    packages: args.solOutput.packages.map((p) => ({
      ...p,
      minimumPhysicalContribution: p.minimumPhysicalContribution ?? p.minimumPhysicalSlots,
      preferredPhysicalContribution: p.preferredPhysicalContribution ?? p.preferredPhysicalSlots,
      requirementGroups: p.requirementGroups ?? [],
    })),
    functionalBudgets: args.solOutput.functionalBudgets,
    openRequirements: args.openRequirements,
    selectedCards: [],
    physicalSlotBudget: {
      expectedNonlands: 64,
      selectedNonlands: 0,
      remainingNonlandSlots: 64,
      expectedLands: 35,
      selectedLands: 0,
      remainingLandSlots: 35,
    },
    manaPlan: { landTarget: 35, colorRequirements: {}, utilityLands: [], selectedLands: [] },
    slotFeasibility: defaultSlotFeasibilityV417(),
    consistencyAudit: defaultConsistencyAuditV417(),
    validation: {
      allSelectedCardsHavePrimaryRequirement: true,
      allSelectedCardsConsumeOnePhysicalSlot: true,
      openRequirementCount: args.openRequirements.length,
      satisfiedRequirementCount: 0,
      corePackagesSatisfied: false,
      winArchitectureVerified: false,
      structurallyReadyForMana: false,
      violations: [],
    },
    revisionHistory: [{ revision: 0, summary: "Sol blueprint generation", changedRequirementIds: [], changedPackageIds: [] }],
  };
  blueprint.consistencyAudit = auditBlueprintConsistencyV417({ blueprint });
  return blueprint;
}
