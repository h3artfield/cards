/**
 * Professor v4.17 — worked Ultimecia fixture for slice-1 acceptance.
 */
import {
  bracketQualityContractV417,
  type BrewBlueprintV417,
  type BrewRequirementV417,
  type CommanderBlueprintV417,
  type RequirementHardConstraintV417,
  type RequirementPreferredQualityV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";
import { mergeSolOutputIntoBlueprintV417, type SolBlueprintOutputV417 } from "./professor-sol-blueprint-contract-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  rankEligibleCandidatesForRequirementV417,
  type RequirementCandidateInputV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { applyRequirementSelectionV417 } from "./professor-brew-blueprint-mutation-v4-17-v1";

export const ULTIMECIA_ORACLE_ID = "70773879-b773-4e81-99ca-8f4bba478962";
export const REQ_GY_RECURSION = "req-graveyard-recursion-1";

export const FIXTURE_CANDIDATES: RequirementCandidateInputV417[] = [
  {
    oracleId: "oid-reanimate",
    name: "Reanimate",
    manaValue: 1,
    colors: ["B"],
    typeLine: "Sorcery",
    oracleText: "Put target creature card from a graveyard onto the battlefield under your control.",
  },
  {
    oracleId: "oid-animate-dead",
    name: "Animate Dead",
    manaValue: 2,
    colors: ["B"],
    typeLine: "Enchantment — Aura",
    oracleText:
      "Enchant creature card in a graveyard. When you cast this spell, return enchanted creature card to the battlefield under your control and attach Animate Dead to it.",
  },
  {
    oracleId: "oid-dreadhorde-invasion",
    name: "Dreadhorde Invasion",
    manaValue: 2,
    colors: ["B"],
    typeLine: "Enchantment",
    oracleText:
      "Whenever a creature card is put into your graveyard from anywhere, create a 2/2 black Zombie creature token.",
  },
  {
    oracleId: "oid-thraxodemon",
    name: "Thraxodemon",
    manaValue: 1,
    colors: ["B"],
    typeLine: "Creature — Demon",
    oracleText:
      "As an additional cost to cast this spell, sacrifice a creature. Whenever you sacrifice a creature, put a +1/+1 counter on Thraxodemon.",
  },
  {
    oracleId: "oid-unrelated-green",
    name: "Cultivate",
    manaValue: 3,
    colors: ["G"],
    typeLine: "Sorcery",
    oracleText: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
  },
];

export function buildUltimeciaCommanderV417(): CommanderBlueprintV417 {
  return {
    oracleId: ULTIMECIA_ORACLE_ID,
    name: "Ultimecia, Time Sorceress // Ultimecia, Omnipotent",
    colorIdentity: ["U", "B", "R"],
    manaValue: 4,
    oracleText:
      "Surveil 2. At the beginning of your end step, if there are three or more cards in your graveyard, transform Ultimecia.",
    semanticFunctions: ["GRAVEYARD_SETUP", "EXTRA_TURN", "TRANSFORM"],
    mechanics: ["surveil", "transform", "extra turn"],
    resourcesProduced: ["graveyard_cards", "extra_turn"],
    resourcesConsumed: ["library_top", "hand"],
    triggeredEvents: ["end_step_transform"],
    zoneRelationships: ["library→graveyard", "graveyard→battlefield"],
    exploitOpportunities: ["graveyard_recursion", "extra_turn_value"],
    provenance: ["golden_catalog", "semantic_oracle"],
  };
}

export function buildGraveyardRecursionRequirementV417(): BrewRequirementV417 {
  const family = "RETURN_FROM_GRAVEYARD" as const;
  const hardRequirements: RequirementHardConstraintV417[] = [
    { constraintId: "legal", description: "Legal in commander color identity" },
    { constraintId: "function", description: "Returns creature from graveyard", semanticToken: functionalTokenForFamily(family) },
  ];
  const preferredRequirements: RequirementPreferredQualityV417[] = [
    { qualityId: "efficiency", description: "low mana investment", weight: 0.9 },
    { qualityId: "synergy", description: "commander synergy", weight: 0.7 },
    { qualityId: "independence", description: "independent usefulness", weight: 0.65 },
  ];
  return {
    requirementId: REQ_GY_RECURSION,
    blueprintRevisionId: 0,
    family,
    purpose: "efficient graveyard recursion",
    priority: 90,
    coverageMode: "FUNCTIONAL_COVERAGE",
    sharePolicy: "PACKAGE_SHAREABLE",
    physicalSlotsNeeded: { min: 0, preferred: 1, max: 2 },
    requiredFunctions: ["RETURN_FROM_GRAVEYARD"],
    requiredMechanics: ["GRAVEYARD → BATTLEFIELD"],
    hardRequirements,
    preferredRequirements,
    acceptableFunctionalAlternatives: [],
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: ["graveyard → battlefield", "low mana investment", "commander synergy", "independent usefulness"],
    packageIds: ["pkg-graveyard-recursion"],
    packageGroupId: "grp-recursion",
    bracketQualityContract: bracketQualityContractV417(4),
    requirementBracketContract: requirementBracketContractV417(family, 4),
    currentCoverage: 0,
    targetCoverage: 1,
    selectedCardIds: [],
    status: "OPEN",
  };
}

function buildSolStubOutputV417(): SolBlueprintOutputV417 {
  return {
    strategy: {
      primaryStrategy: "Graveyard-centric midrange with extra-turn finisher",
      secondaryStrategy: "Surveil-driven self-mill into recursion",
      commanderExploit: "Transform Ultimecia after surveil fills graveyard; recursion returns best threats",
      independentEngine: "Self-mill + recursion engine works without commander on board",
      expectedPlayPattern: "Develop graveyard enablers, recur threats, transform for extra turn",
      strategicThesis: "Maximize surveil value with efficient graveyard recursion under B4 quality",
      strengths: ["surveil density", "extra turn finisher", "recursion redundancy"],
      weaknesses: ["graveyard hate", "transform timing"],
      dependencies: ["graveyard enablers", "efficient recursion"],
      protectionNeeds: ["graveyard protection", "stack interaction"],
      accessNeeds: ["tutors for recursion", "surveil enablers"],
    },
    bracketContract: {
      requestedBracket: 4,
      accelerationExpectation: "moderate ramp 9-12",
      interactionExpectation: "8-12 instant-speed answers",
      cardQualityExpectation: "high efficiency, low MV premium",
      tutorExpectation: "limited tutors acceptable",
      protectionExpectation: "2-5 protection pieces",
      redundancyExpectation: "multiple recursion lines",
      threatSpeedExpectation: "midrange with explosive extra turn",
      recoveryExpectation: "graveyard recursion primary recovery",
      winCompactnessExpectation: "compact via extra turn + board",
      comboPolicy: "no infinite combos",
      commanderDependenceTarget: "medium",
    },
    winArchitecture: [
      {
        planId: "win-extra-turn",
        plan: "Transform Ultimecia for extra turn; attack with menace board",
        status: "HYPOTHESIZED",
        mechanicallyVerified: false,
        requiredFunctions: ["WIN_SUPPORT"],
        requiredCardsOrEquivalents: [],
      },
    ],
    packages: [
      {
        packageId: "pkg-graveyard-recursion",
        name: "Graveyard Engine",
        purpose: "Return creatures from graveyard efficiently",
        core: true,
        minimumPhysicalSlots: 5,
        preferredPhysicalSlots: 8,
        maximumPhysicalSlots: 10,
        minimumPhysicalContribution: 5,
        preferredPhysicalContribution: 8,
        requirementGroups: [
          {
            groupId: "grp-setup",
            name: "setup",
            mandatory: true,
            relatedRequirementIds: ["req-gy-setup-1"],
            minimumPhysicalSlots: 2,
            preferredPhysicalSlots: 3,
          },
          {
            groupId: "grp-recursion",
            name: "recursion",
            mandatory: true,
            relatedRequirementIds: [REQ_GY_RECURSION],
            minimumPhysicalSlots: 2,
            preferredPhysicalSlots: 3,
          },
          {
            groupId: "grp-payoff",
            name: "payoff",
            mandatory: true,
            relatedRequirementIds: ["req-gy-payoff-1"],
            minimumPhysicalSlots: 1,
            preferredPhysicalSlots: 2,
          },
        ],
        requiredFunctions: ["RETURN_FROM_GRAVEYARD", "GRAVEYARD_ENABLER"],
        preferredFunctions: ["ENGINE_PAYOFF"],
        relatedRequirementIds: [REQ_GY_RECURSION],
        status: "OPEN",
        selectedCardIds: [],
      },
    ],
    functionalBudgets: [
      { category: "ACCELERATION", minimum: 9, maximum: 12, functionalCoverageSelected: 0 },
      { category: "INTERACTION", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "RETURN_FROM_GRAVEYARD", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      { category: "ENGINE", minimum: 10, maximum: 14, functionalCoverageSelected: 0 },
    ],
    researchSeeds: ["Reanimate", "Unearth", "Eternal Witness"],
  };
}

export function buildUltimeciaBlueprintFixtureV417(): BrewBlueprintV417 {
  const commander = buildUltimeciaCommanderV417();
  const requirement = buildGraveyardRecursionRequirementV417();
  return mergeSolOutputIntoBlueprintV417({
    commander,
    userIntent: {
      format: "Commander",
      bracket: 4,
      playStyle: "efficient midrange",
      commanderDependence: "medium",
      comboPolicy: "no infinite combos",
      archetype: "graveyard recursion",
    },
    solOutput: buildSolStubOutputV417(),
    openRequirements: [requirement],
  });
}

export type WorkedFixtureTraceV417 = {
  commander: CommanderBlueprintV417;
  blueprint: BrewBlueprintV417;
  requirement: BrewRequirementV417;
  compiledQuery: ReturnType<typeof compileRequirementSemanticQueryV417>;
  evaluations: ReturnType<typeof evaluateCandidateAgainstRequirementV417>[];
  rankedEligible: ReturnType<typeof rankEligibleCandidatesForRequirementV417>;
  selectedBlueprint: BrewBlueprintV417;
};

export function runUltimeciaGraveyardRecursionFixtureV417(): WorkedFixtureTraceV417 {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildUltimeciaBlueprintFixtureV417();
  const requirement = blueprint.openRequirements[0]!;
  const compiledQuery = compileRequirementSemanticQueryV417(requirement);

  const evaluations = FIXTURE_CANDIDATES.map((candidate) =>
    evaluateCandidateAgainstRequirementV417({
      requirement,
      compiledQuery,
      candidate,
      commanderColorIdentity: commander.colorIdentity,
      genericEngineScore: candidate.name === "Dreadhorde Invasion" ? 99 : candidate.name === "Thraxodemon" ? 95 : 50,
      genericCharterScore: candidate.name === "Dreadhorde Invasion" ? 98 : 40,
    }),
  );

  const rankedEligible = rankEligibleCandidatesForRequirementV417(evaluations);
  const top = rankedEligible[0];
  if (!top) throw new Error("NO_ELIGIBLE_CANDIDATE");
  const winner = FIXTURE_CANDIDATES.find((c) => c.oracleId === top.oracleId)!;

  const selectedBlueprint = applyRequirementSelectionV417({
    blueprint,
    requirementId: requirement.requirementId,
    topEvaluation: top,
    candidateOracleText: winner.oracleText!,
    candidateTypeLine: winner.typeLine!,
  });

  return {
    commander,
    blueprint,
    requirement,
    compiledQuery,
    evaluations,
    rankedEligible,
    selectedBlueprint,
  };
}
