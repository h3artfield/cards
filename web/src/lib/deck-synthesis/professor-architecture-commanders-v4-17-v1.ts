/**
 * Professor v4.17 — architecture test commanders (deterministic Sol proposals, not prospectives).
 */
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { normalizeSolConceptsV417, unsupportedConceptLabels } from "./professor-semantic-concept-normalizer-v4-17-v1";
import { auditBlueprintConsistencyV417, assessBlueprintSlotFeasibilityV417 } from "./professor-blueprint-feasibility-v4-17-v1";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";

export const PROFESSOR_ARCHITECTURE_COMMANDERS_V4_17_V1_VERSION = "professor-architecture-commanders-v4-17-v1";

export type ArchitectureCommanderCaseV417 = {
  caseId: string;
  archetype: string;
  commander: CommanderBlueprintV417;
  proposal: SolBlueprintProposalV417;
};

function baseBracketContract(bracket: number) {
  return {
    requestedBracket: bracket,
    accelerationExpectation: "moderate ramp",
    interactionExpectation: "efficient answers",
    cardQualityExpectation: "high efficiency",
    tutorExpectation: "limited tutors",
    protectionExpectation: "key piece protection",
    redundancyExpectation: "multiple lines",
    threatSpeedExpectation: "midrange",
    recoveryExpectation: "engine recovery",
    winCompactnessExpectation: "compact wins",
    comboPolicy: "no infinite combos",
    commanderDependenceTarget: "medium",
  };
}

function proposal(partial: Omit<SolBlueprintProposalV417, "version">): SolBlueprintProposalV417 {
  return validateSolBlueprintProposalV417({ version: "professor-sol-blueprint-proposal-v4-17-v1", ...partial });
}

export const ARCHITECTURE_COMMANDER_CASES_V417: ArchitectureCommanderCaseV417[] = [
  {
    caseId: "graveyard-ultimecia",
    archetype: "graveyard",
    commander: buildUltimeciaCommanderV417(),
    proposal: proposal({
      strategicThesis: "Graveyard recursion with extra-turn finisher under B4 efficiency",
      primaryStrategy: "Surveil into recursion then transform for extra turn",
      secondaryStrategy: "Independent self-mill engine",
      commanderExploit: "Transform after graveyard is stocked",
      independentEngine: "Recursion works without commander",
      expectedPlayPattern: "Enablers → recursion → transform",
      strategicConcepts: ["graveyard recursion", "surveil self-mill", "extra turn finisher"],
      packages: [
        {
          packageId: "pkg-gy-engine",
          name: "Graveyard Engine",
          purpose: "Setup, recursion, payoff",
          core: true,
          minimumPhysicalSlots: 5,
          preferredPhysicalSlots: 8,
          maximumPhysicalSlots: 10,
          minimumPhysicalContribution: 5,
          preferredPhysicalContribution: 8,
          requirementGroups: [
            { groupId: "setup", name: "setup", mandatory: true, relatedRequirementIds: ["req-gy-setup"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "recursion", name: "recursion", mandatory: true, relatedRequirementIds: ["req-gy-recursion"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "payoff", name: "payoff", mandatory: true, relatedRequirementIds: ["req-gy-payoff"], minimumPhysicalSlots: 1, preferredPhysicalSlots: 2 },
          ],
          requiredFunctions: ["GRAVEYARD_ENABLER", "RETURN_FROM_GRAVEYARD"],
          preferredFunctions: ["ENGINE_PAYOFF"],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [{ planId: "win-extra-turn", plan: "Extra turn board attack", status: "HYPOTHESIZED", mechanicallyVerified: false, requiredFunctions: ["WIN_COMPONENT"], requiredCardsOrEquivalents: [] }],
      functionalBudgets: [
        { category: "ACCELERATION", minimum: 9, maximum: 12, functionalCoverageSelected: 0 },
        { category: "INTERACTION", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
        { category: "RETURN_FROM_GRAVEYARD", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["tutor recursion pieces"],
      protectionNeeds: ["graveyard protection"],
      weaknesses: ["graveyard hate"],
      strengths: ["recursion redundancy"],
      dependencies: ["graveyard enablers"],
      bracketConstructionGuidance: ["B4 efficiency", "low MV premium"],
      researchSeeds: ["Reanimate"],
      bracketContract: baseBracketContract(4),
    }),
  },
  {
    caseId: "aristocrats-chatterfang",
    archetype: "tokens/aristocrats",
    commander: {
      oracleId: "chatterfang-oracle",
      name: "Chatterfang, Squirrel General",
      colorIdentity: ["B", "G"],
      manaValue: 4,
      oracleText: "Whenever you create a token, create a 1/1 green Squirrel creature token. Squirrels you control have menace.",
      semanticFunctions: ["TOKEN_GENERATION", "RESOURCE_CONVERSION"],
      mechanics: ["token_doubling", "menace"],
      resourcesProduced: ["tokens", "squirrels"],
      resourcesConsumed: ["creatures"],
      triggeredEvents: ["token_creation"],
      zoneRelationships: ["battlefield→graveyard"],
      exploitOpportunities: ["aristocrats", "token_payoff"],
      provenance: ["fixture"],
    },
    proposal: proposal({
      strategicThesis: "Token aristocrats with sacrifice payoffs",
      primaryStrategy: "Generate tokens then sacrifice for value",
      secondaryStrategy: "Go-wide combat",
      commanderExploit: "Double token generation",
      independentEngine: "Sacrifice outlets work without commander",
      expectedPlayPattern: "Tokens → sacrifice → drain",
      strategicConcepts: ["token exploitation", "sacrifice conversion", "aristocrats drain"],
      packages: [
        {
          packageId: "pkg-aristocrats",
          name: "Aristocrats Engine",
          purpose: "Token + sacrifice loop",
          core: true,
          minimumPhysicalSlots: 6,
          preferredPhysicalSlots: 9,
          maximumPhysicalSlots: 12,
          minimumPhysicalContribution: 6,
          preferredPhysicalContribution: 9,
          requirementGroups: [
            { groupId: "tokens", name: "token production", mandatory: true, relatedRequirementIds: ["req-tokens"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "outlets", name: "sacrifice outlets", mandatory: true, relatedRequirementIds: ["req-sac-outlet"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "payoffs", name: "aristocrat payoffs", mandatory: true, relatedRequirementIds: ["req-payoff"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
          ],
          requiredFunctions: ["RESOURCE_PRODUCTION", "RESOURCE_CONSUMER", "ENGINE_PAYOFF"],
          preferredFunctions: ["ENGINE_ENABLER"],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [{ planId: "win-drain", plan: "Drain opponents via deaths", status: "HYPOTHESIZED", mechanicallyVerified: false, requiredFunctions: ["WIN_COMPONENT"], requiredCardsOrEquivalents: [] }],
      functionalBudgets: [
        { category: "RESOURCE_PRODUCTION", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
        { category: "INTERACTION", minimum: 6, maximum: 10, functionalCoverageSelected: 0 },
        { category: "ENGINE_PAYOFF", minimum: 6, maximum: 10, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["find sacrifice payoffs"],
      protectionNeeds: ["protect engine pieces"],
      weaknesses: ["board wipes"],
      strengths: ["wide board"],
      dependencies: ["token makers"],
      bracketConstructionGuidance: ["B3 midrange"],
      researchSeeds: ["Pitiless Plunderer"],
      bracketContract: baseBracketContract(3),
    }),
  },
  {
    caseId: "spellslinger-kess",
    archetype: "spellslinger",
    commander: {
      oracleId: "kess-oracle",
      name: "Kess, Dissident Mage",
      colorIdentity: ["U", "B", "R"],
      manaValue: 3,
      oracleText: "Flying. Once during each of your turns, you may cast an instant or sorcery card from your graveyard.",
      semanticFunctions: ["GRAVEYARD_CAST", "SPELL_RECURSION"],
      mechanics: ["cast_from_graveyard", "flying"],
      resourcesProduced: ["spell_reuse"],
      resourcesConsumed: ["graveyard_spells"],
      triggeredEvents: [],
      zoneRelationships: ["graveyard→stack"],
      exploitOpportunities: ["spell_copy", "graveyard_spells"],
      provenance: ["fixture"],
    },
    proposal: proposal({
      strategicThesis: "Graveyard spellslinger with copy effects",
      primaryStrategy: "Fill graveyard with instants/sorceries, cast repeatedly",
      secondaryStrategy: "Combo finish via spell chain",
      commanderExploit: "Cast one spell from graveyard each turn",
      independentEngine: "Self-mill + spell payoffs",
      expectedPlayPattern: "Mill → cast → copy → win",
      strategicConcepts: ["spell copying", "graveyard recursion", "card draw"],
      packages: [
        {
          packageId: "pkg-spells",
          name: "Spellslinger Engine",
          purpose: "Spell velocity and recursion",
          core: true,
          minimumPhysicalSlots: 5,
          preferredPhysicalSlots: 8,
          maximumPhysicalSlots: 10,
          minimumPhysicalContribution: 5,
          preferredPhysicalContribution: 8,
          requirementGroups: [
            { groupId: "velocity", name: "card velocity", mandatory: true, relatedRequirementIds: ["req-draw"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "spells", name: "spell enablers", mandatory: true, relatedRequirementIds: ["req-spell-enabler"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
          ],
          requiredFunctions: ["CARD_VELOCITY", "ENGINE_ENABLER"],
          preferredFunctions: ["INTERACTION"],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [{ planId: "win-spell", plan: "Burst spell chain", status: "HYPOTHESIZED", mechanicallyVerified: false, requiredFunctions: ["WIN_COMPONENT"], requiredCardsOrEquivalents: [] }],
      functionalBudgets: [
        { category: "CARD_VELOCITY", minimum: 10, maximum: 14, functionalCoverageSelected: 0 },
        { category: "INTERACTION", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
        { category: "ENGINE_ENABLER", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["find combo pieces"],
      protectionNeeds: ["protect Kess"],
      weaknesses: ["graveyard hate"],
      strengths: ["instant speed"],
      dependencies: ["self-mill"],
      bracketConstructionGuidance: ["B4 interaction density"],
      researchSeeds: ["Frantic Search"],
      bracketContract: baseBracketContract(4),
    }),
  },
  {
    caseId: "voltron-sigarda",
    archetype: "Voltron/combat",
    commander: {
      oracleId: "sigarda-oracle",
      name: "Sigarda, Host of Herons",
      colorIdentity: ["G", "W", "U"],
      manaValue: 5,
      oracleText: "Flying, hexproof from black and red. Spells your opponents control can't cause you to sacrifice permanents.",
      semanticFunctions: ["PROTECTION", "COMBAT"],
      mechanics: ["flying", "hexproof"],
      resourcesProduced: ["protected_threat"],
      resourcesConsumed: [],
      triggeredEvents: [],
      zoneRelationships: [],
      exploitOpportunities: ["equipment_aura_voltron"],
      provenance: ["fixture"],
    },
    proposal: proposal({
      strategicThesis: "Voltron combat with protection",
      primaryStrategy: "Stack auras/equipment on evasive commander",
      secondaryStrategy: "Backup combat threats",
      commanderExploit: "Hexproof from black/red",
      independentEngine: "Other voltron targets",
      expectedPlayPattern: "Ramp → suit up → attack",
      strategicConcepts: ["combat voltron", "protection", "mana ramp"],
      packages: [
        {
          packageId: "pkg-voltron",
          name: "Voltron Package",
          purpose: "Equipment, auras, protection",
          core: true,
          minimumPhysicalSlots: 4,
          preferredPhysicalSlots: 6,
          maximumPhysicalSlots: 8,
          minimumPhysicalContribution: 4,
          preferredPhysicalContribution: 6,
          requirementGroups: [
            { groupId: "ramp", name: "acceleration", mandatory: true, relatedRequirementIds: ["req-ramp"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "protection", name: "protection", mandatory: true, relatedRequirementIds: ["req-protect"], minimumPhysicalSlots: 1, preferredPhysicalSlots: 2 },
          ],
          requiredFunctions: ["ACCELERATION", "PROTECTION", "WIN_COMPONENT"],
          preferredFunctions: ["INTERACTION"],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [{ planId: "win-combat", plan: "Commander combat damage", status: "HYPOTHESIZED", mechanicallyVerified: false, requiredFunctions: ["WIN_COMPONENT"], requiredCardsOrEquivalents: [] }],
      functionalBudgets: [
        { category: "ACCELERATION", minimum: 10, maximum: 14, functionalCoverageSelected: 0 },
        { category: "PROTECTION", minimum: 3, maximum: 6, functionalCoverageSelected: 0 },
        { category: "WIN_COMPONENT", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["find equipment"],
      protectionNeeds: ["hexproof redundancy"],
      weaknesses: ["wraths", "non-BR removal"],
      strengths: ["hexproof"],
      dependencies: ["ramp"],
      bracketConstructionGuidance: ["B3 combat"],
      researchSeeds: ["Sword of Feast and Famine"],
      bracketContract: baseBracketContract(3),
    }),
  },
  {
    caseId: "resource-korvold",
    archetype: "unusual resource-conversion",
    commander: {
      oracleId: "korvold-oracle",
      name: "Korvold, Fae-Cursed King",
      colorIdentity: ["B", "R", "G"],
      manaValue: 5,
      oracleText: "Flying. Whenever Korvold enters or attacks, sacrifice another permanent and draw a card.",
      semanticFunctions: ["RESOURCE_CONSUMER", "CARD_VELOCITY"],
      mechanics: ["sacrifice", "draw"],
      resourcesProduced: ["cards", "counters"],
      resourcesConsumed: ["permanents"],
      triggeredEvents: ["attack_sacrifice"],
      zoneRelationships: ["battlefield→graveyard"],
      exploitOpportunities: ["sacrifice_conversion", "food_tokens"],
      provenance: ["fixture"],
    },
    proposal: proposal({
      strategicThesis: "Sacrifice food and permanents for card advantage and counters",
      primaryStrategy: "Convert expendable permanents into cards and power",
      secondaryStrategy: "Treasure/food synergy",
      commanderExploit: "Attack trigger sacrifices for cards",
      independentEngine: "Sacrifice outlets independent of commander",
      expectedPlayPattern: "Food → sacrifice → draw → combat",
      strategicConcepts: ["sacrifice conversion", "resource production", "card draw"],
      packages: [
        {
          packageId: "pkg-sac-engine",
          name: "Sacrifice Conversion",
          purpose: "Outlets, payoffs, food",
          core: true,
          minimumPhysicalSlots: 5,
          preferredPhysicalSlots: 7,
          maximumPhysicalSlots: 9,
          minimumPhysicalContribution: 5,
          preferredPhysicalContribution: 7,
          requirementGroups: [
            { groupId: "outlets", name: "sacrifice outlets", mandatory: true, relatedRequirementIds: ["req-sac"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
            { groupId: "payoffs", name: "payoffs", mandatory: true, relatedRequirementIds: ["req-payoff"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
          ],
          requiredFunctions: ["RESOURCE_CONSUMER", "RESOURCE_PRODUCTION", "CARD_VELOCITY"],
          preferredFunctions: ["ENGINE_PAYOFF"],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [{ planId: "win-combat", plan: "Large Korvold combat", status: "HYPOTHESIZED", mechanicallyVerified: false, requiredFunctions: ["WIN_COMPONENT"], requiredCardsOrEquivalents: [] }],
      functionalBudgets: [
        { category: "CARD_VELOCITY", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
        { category: "RESOURCE_PRODUCTION", minimum: 6, maximum: 10, functionalCoverageSelected: 0 },
        { category: "ENGINE_PAYOFF", minimum: 6, maximum: 10, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["find sacrifice payoffs"],
      protectionNeeds: ["protect Korvold"],
      weaknesses: ["removal on commander"],
      strengths: ["card engine"],
      dependencies: ["sacrifice fodder"],
      bracketConstructionGuidance: ["B4 card quality"],
      researchSeeds: ["Food Chain"],
      bracketContract: baseBracketContract(4),
    }),
  },
];

export type ArchitectureCommanderReportV417 = {
  caseId: string;
  archetype: string;
  commander: string;
  strategy: string;
  exploit: string;
  normalizedConcepts: ReturnType<typeof normalizeSolConceptsV417>;
  unsupportedConcepts: string[];
  packages: string[];
  functionalBudgets: string[];
  materializedRequirementCount: number;
  requirementFamilies: string[];
  physicalFeasibility: ReturnType<typeof assessBlueprintSlotFeasibilityV417>;
  consistencyAudit: ReturnType<typeof auditBlueprintConsistencyV417>;
};

export function runArchitectureCommanderReportV417(testCase: ArchitectureCommanderCaseV417): ArchitectureCommanderReportV417 {
  const blueprint = buildBlueprintFromSolProposalV417({
    commander: testCase.commander,
    userIntent: {
      format: "Commander",
      bracket: testCase.proposal.bracketContract.requestedBracket,
      playStyle: testCase.archetype,
      commanderDependence: "medium",
      comboPolicy: testCase.proposal.bracketContract.comboPolicy,
    },
    proposal: testCase.proposal,
  });
  const normalized = normalizeSolConceptsV417(testCase.proposal.strategicConcepts);
  return {
    caseId: testCase.caseId,
    archetype: testCase.archetype,
    commander: testCase.commander.name,
    strategy: testCase.proposal.primaryStrategy,
    exploit: testCase.proposal.commanderExploit,
    normalizedConcepts: normalized,
    unsupportedConcepts: unsupportedConceptLabels(normalized),
    packages: blueprint.packages.map((p) => p.name),
    functionalBudgets: blueprint.functionalBudgets.map((b) => `${b.category}:${b.minimum}-${b.maximum}`),
    materializedRequirementCount: blueprint.openRequirements.length,
    requirementFamilies: [...new Set(blueprint.openRequirements.map((r) => r.family))],
    physicalFeasibility: assessBlueprintSlotFeasibilityV417(blueprint),
    consistencyAudit: auditBlueprintConsistencyV417({ blueprint, proposal: testCase.proposal }),
  };
}

export function buildOverconstrainedBlueprintV417(): BrewBlueprintV417 {
  const testCase = ARCHITECTURE_COMMANDER_CASES_V417[0]!;
  const blueprint = buildBlueprintFromSolProposalV417({
    commander: testCase.commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "test", commanderDependence: "high", comboPolicy: "none" },
    proposal: {
      ...testCase.proposal,
      packages: testCase.proposal.packages.map((p) => ({
        ...p,
        core: true,
        minimumPhysicalContribution: p.core ? 70 : (p.minimumPhysicalContribution ?? p.minimumPhysicalSlots),
        preferredPhysicalContribution: p.core ? 72 : (p.preferredPhysicalContribution ?? p.preferredPhysicalSlots),
      })),
    },
  });
  blueprint.slotFeasibility = assessBlueprintSlotFeasibilityV417(blueprint);
  return blueprint;
}
