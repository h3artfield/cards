/**
 * PROFESSOR v4.17 Slice 5.4 — relational access, dynamic mana frontier, bounded tail repair.
 */
import assert from "node:assert/strict";
import {
  evaluateAccessToolCandidateV417,
  buildAccessPortfolioStateV417,
  deriveCriticalAccessTargetsV417,
  isAccessPortfolioBudgetCategory,
} from "./professor-brew-blueprint-access-v4-17-v1";
import {
  computeNonlandManaFrontierV417,
  shouldContinueNonlandAssemblyV417,
  evaluateDynamicNonlandClosureV417,
} from "./professor-brew-blueprint-mana-frontier-v4-17-v1";
import {
  computeFunctionalDensityStatesV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { normalizeFunctionalBudgetCategoryV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { mapTailExhaustionToFailureV417 } from "./professor-blueprint-assembly-types-v4-17-v1";
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";

type MockCard = {
  oracleId: string;
  canonicalName: string;
  oracleText: string;
  typeLine: string;
  manaValue: number;
  colors: string[];
  colorIdentity: string[];
  legalities?: { commander?: string };
};

function mockCatalog(cards: MockCard[]) {
  return { byOracleId: new Map(cards.map((c) => [c.oracleId, c])) } as unknown as import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog;
}

function testAccessPortfolioNormalization() {
  const norm = normalizeFunctionalBudgetCategoryV417("tutorsAndAccess");
  assert.equal(norm.accessPortfolio, true);
  assert.deepEqual(norm.normalizedFunctions, []);
  assert.ok(isAccessPortfolioBudgetCategory("tutorsAndAccess"));
  console.log("PASS tutorsAndAccess normalizes to ACCESS PORTFOLIO");
}

function testRelationalAccessTruth() {
  const catalog = mockCatalog([
    {
      oracleId: "target-1",
      canonicalName: "Brain Freeze",
      oracleText: "Target player mills three cards.",
      typeLine: "Instant",
      manaValue: 2,
      colors: ["U"],
      colorIdentity: ["U"],
      legalities: { commander: "legal" },
    },
    {
      oracleId: "tutor-creature",
      canonicalName: "Worldly Tutor",
      oracleText: "Search your library for a creature card, reveal it, put it into your hand, then shuffle.",
      typeLine: "Instant",
      manaValue: 1,
      colors: ["G"],
      colorIdentity: ["G"],
      legalities: { commander: "legal" },
    },
    {
      oracleId: "tutor-is",
      canonicalName: "Mystical Tutor",
      oracleText: "Search your library for an instant or sorcery card, reveal it, put it into your hand, then shuffle.",
      typeLine: "Instant",
      manaValue: 1,
      colors: ["U"],
      colorIdentity: ["U"],
      legalities: { commander: "legal" },
    },
  ]);

  const targets = [
    {
      name: "Brain Freeze",
      oracleId: "target-1",
      kind: "PRIMARY_WIN" as const,
      manaValue: 2,
      cardTypes: ["Instant"],
    },
  ];

  const wrong = evaluateAccessToolCandidateV417({
    oracleId: "tutor-creature",
    name: "Worldly Tutor",
    oracleText: "Search your library for a creature card, reveal it, put it into your hand, then shuffle.",
    typeLine: "Instant",
    commanderColorIdentity: ["G", "U"],
    catalog,
    criticalTargets: targets,
  });
  assert.equal(wrong.qualifies, false);
  assert.equal(wrong.rejection?.reason, "NO_RELEVANT_TARGET");

  const right = evaluateAccessToolCandidateV417({
    oracleId: "tutor-is",
    name: "Mystical Tutor",
    oracleText: "Search your library for an instant or sorcery card, reveal it, put it into your hand, then shuffle.",
    typeLine: "Instant",
    commanderColorIdentity: ["U"],
    catalog,
    criticalTargets: targets,
  });
  assert.equal(right.qualifies, true);
  assert.equal(right.tool?.destination, "HAND");
  assert.equal(right.tool?.verifiedRoutes.length, 1);
  console.log("PASS relational access — wrong tutor rejected, verified route accepted");
}

function testOneToolThreeRoutesNotThreeTools() {
  const catalog = mockCatalog([
    {
      oracleId: "t1",
      canonicalName: "Isochron Scepter",
      oracleText: "Imprint an instant card.",
      typeLine: "Artifact",
      manaValue: 2,
      colors: [],
      colorIdentity: [],
      legalities: { commander: "legal" },
    },
    {
      oracleId: "t2",
      canonicalName: "Dramatic Reversal",
      oracleText: "Untap all artifacts.",
      typeLine: "Instant",
      manaValue: 2,
      colors: ["U"],
      colorIdentity: ["U"],
      legalities: { commander: "legal" },
    },
    {
      oracleId: "t3",
      canonicalName: "Brain Freeze",
      oracleText: "Target player mills three cards.",
      typeLine: "Instant",
      manaValue: 2,
      colors: ["U"],
      colorIdentity: ["U"],
      legalities: { commander: "legal" },
    },
    {
      oracleId: "tutor",
      canonicalName: "Enlightened Tutor",
      oracleText: "Search your library for an artifact or enchantment card, reveal it, put it into your hand, then shuffle.",
      typeLine: "Instant",
      manaValue: 1,
      colors: ["W"],
      colorIdentity: ["W"],
      legalities: { commander: "legal" },
    },
  ]);

  const blueprint = {
    commander: { name: "Test", oracleId: "cmd", colorIdentity: ["W", "U"], manaValue: 3 },
    selectedCards: [
      {
        oracleId: "tutor",
        name: "Enlightened Tutor",
        satisfiedFunctions: ["ACCESS"],
        physicalSlotsConsumed: 1,
        primaryRequirementId: "fd-tutorsandaccess-0",
        secondaryRequirementIds: [],
        primaryFunction: "ACCESS",
        secondaryFunctions: [],
        tertiaryFunctions: [],
        packageIds: [],
        packageContributions: [],
        functionalDensityContributions: [],
        semanticEvidence: [],
        bracketContribution: [],
        canonicalVerified: true,
      },
      {
        oracleId: "t1",
        name: "Isochron Scepter",
        satisfiedFunctions: ["ENGINE_ENABLER"],
        physicalSlotsConsumed: 1,
        primaryRequirementId: "pkg-1",
        secondaryRequirementIds: [],
        primaryFunction: "ENGINE_ENABLER",
        secondaryFunctions: [],
        tertiaryFunctions: [],
        packageIds: [],
        packageContributions: [],
        functionalDensityContributions: [],
        semanticEvidence: [],
        bracketContribution: [],
        canonicalVerified: true,
      },
    ],
    functionalBudgets: [{ category: "tutorsAndAccess", minimum: 6, maximum: 8, functionalCoverageSelected: 0 }],
    packages: [],
    winArchitecture: [],
    openRequirements: [],
    userIntent: { bracket: 4, format: "Commander", playStyle: "test", commanderDependence: "medium", comboPolicy: "" },
  } as unknown as BrewBlueprintV417;

  const portfolio = buildAccessPortfolioStateV417({ blueprint, catalog });
  assert.equal(portfolio.distinctAccessTools, 1);
  assert.ok(portfolio.routeCount >= 1);
  const states = computeFunctionalDensityStatesV417(blueprint, catalog);
  const accessState = states.find((s) => s.category === "tutorsAndAccess");
  assert.equal(accessState?.currentDistinctContributors, 1);
  console.log("PASS access density — one physical tool, verified routes counted separately");
}

function testDynamicManaFrontier62Plus37() {
  const cards = Array.from({ length: 62 }, (_, i) => ({
    oracleId: `card-${i}`,
    name: `Card ${i}`,
    satisfiedFunctions: i < 8 ? (["ACCELERATION"] as const) : (["FLEX"] as const),
    physicalSlotsConsumed: 1 as const,
    primaryRequirementId: `req-${i}`,
    secondaryRequirementIds: [] as string[],
    primaryFunction: "FLEX" as const,
    secondaryFunctions: [] as const,
    tertiaryFunctions: [] as const,
    packageIds: [] as string[],
    packageContributions: [],
    functionalDensityContributions: [],
    semanticEvidence: [],
    bracketContribution: [],
    canonicalVerified: true,
  }));

  const blueprint = {
    commander: { name: "Chatterfang", oracleId: "cmd", colorIdentity: ["B", "G"], manaValue: 4 },
    selectedCards: cards,
    functionalBudgets: [
      { category: "lands", minimum: 35, maximum: 37, functionalCoverageSelected: 0 },
      { category: "manaAcceleration", minimum: 8, maximum: 10, functionalCoverageSelected: 8 },
    ],
    packages: [{ packageId: "core", name: "Core", purpose: "", core: true, status: "SATISFIED", selectedCardIds: [], minimumPhysicalContribution: 1, preferredPhysicalContribution: 2, maximumPhysicalSlots: 10, minimumPhysicalSlots: 1, preferredPhysicalSlots: 2, requirementGroups: [], requiredFunctions: [], preferredFunctions: [], relatedRequirementIds: [] }],
    winArchitecture: [{ planId: "win", plan: "combo", status: "VERIFIED", mechanicallyVerified: true, requiredFunctions: [], requiredCardsOrEquivalents: [] }],
    openRequirements: [],
    userIntent: { bracket: 4, format: "Commander", playStyle: "tokens", commanderDependence: "medium", comboPolicy: "" },
    manaPlan: { landTarget: 35, colorRequirements: {}, utilityLands: [], selectedLands: [] },
    physicalSlotBudget: { expectedNonlands: 64, selectedNonlands: 62, remainingNonlandSlots: 2, expectedLands: 35, selectedLands: 0, remainingLandSlots: 35 },
    slotFeasibility: { feasible: true, minimumUniquePhysicalRequired: 40, summary: "" },
  } as unknown as BrewBlueprintV417;

  const frontier = computeNonlandManaFrontierV417({
    blueprint,
    nextNonlandMarginalUtility: 0,
  });
  assert.equal(frontier.selectedNonlands, 62);
  assert.equal(frontier.nextNonlandMarginalUtility, 0);
  assert.equal(frontier.dynamicNonlandCap + frontier.candidateLandRange.preferred, COMMANDER_DECK_LIBRARY_SIZE_V47);
  assert.ok(frontier.candidateLandRange.preferred >= 35 && frontier.candidateLandRange.preferred <= 38);
  console.log(
    `PASS dynamic mana frontier — 62 nonlands + ${frontier.candidateLandRange.preferred} lands = ${COMMANDER_DECK_LIBRARY_SIZE_V47} (recommendation=${frontier.recommendation})`,
  );
}

function testNoLandPaddingWhenMandatoryDeficit() {
  const blueprint = {
    commander: { name: "Test", oracleId: "cmd", colorIdentity: ["U"], manaValue: 3 },
    selectedCards: Array.from({ length: 40 }, (_, i) => ({
      oracleId: `c-${i}`,
      name: `C ${i}`,
      satisfiedFunctions: ["FLEX"],
      physicalSlotsConsumed: 1,
      primaryRequirementId: `r-${i}`,
      secondaryRequirementIds: [],
      primaryFunction: "FLEX",
      secondaryFunctions: [],
      tertiaryFunctions: [],
      packageIds: [],
      packageContributions: [],
      functionalDensityContributions: [],
      semanticEvidence: [],
      bracketContribution: [],
      canonicalVerified: true,
    })),
    functionalBudgets: [{ category: "tutorsAndAccess", minimum: 6, maximum: 8, functionalCoverageSelected: 0 }],
    packages: [{ packageId: "core", name: "Core", purpose: "", core: true, status: "OPEN", selectedCardIds: [], minimumPhysicalContribution: 5, preferredPhysicalContribution: 6, maximumPhysicalSlots: 10, minimumPhysicalSlots: 5, preferredPhysicalSlots: 6, requirementGroups: [], requiredFunctions: [], preferredFunctions: [], relatedRequirementIds: [] }],
    winArchitecture: [{ planId: "win", plan: "x", status: "OPEN", mechanicallyVerified: false, requiredFunctions: [], requiredCardsOrEquivalents: [] }],
    openRequirements: [{ requirementId: "fd-tutorsandaccess-0", status: "OPEN", family: "FUNCTIONAL_DENSITY" }],
    userIntent: { bracket: 4, format: "Commander", playStyle: "test", commanderDependence: "medium", comboPolicy: "" },
    manaPlan: { landTarget: 35, colorRequirements: {}, utilityLands: [], selectedLands: [] },
    physicalSlotBudget: { expectedNonlands: 64, selectedNonlands: 40, remainingNonlandSlots: 24, expectedLands: 35, selectedLands: 0, remainingLandSlots: 35 },
    slotFeasibility: { feasible: true, minimumUniquePhysicalRequired: 40, summary: "" },
  } as unknown as BrewBlueprintV417;

  const frontier = computeNonlandManaFrontierV417({ blueprint });
  assert.equal(frontier.recommendation, "STRUCTURE_REPAIR_REQUIRED");
  assert.equal(shouldContinueNonlandAssemblyV417(blueprint, frontier), true);
  const closure = evaluateDynamicNonlandClosureV417(blueprint, frontier);
  assert.equal(closure.valid, false);
  console.log("PASS no land padding — mandatory deficit blocks ADD_LAND");
}

function testTerminalClassifications() {
  assert.equal(mapTailExhaustionToFailureV417({ densityChallenge: { budgetId: "x", category: "y", requestedMinimum: 6, viableAtQualityFloor: 2, proposedMinimum: 2, proposedPreferred: 4 }, objectiveId: "x", objectiveType: "FUNCTIONAL_DENSITY", fullCorpusAttempted: true, legalCorpusCovered: 100, uniqueCandidatesEvaluated: 100, semanticEligible: 0, qualityPassed: 2, positiveUtility: 0, terminalReason: "QUALITY_FLOOR", supplyTrace: { objectiveId: "x", objectiveType: "FUNCTIONAL_DENSITY", legalCorpusSize: 100, canonicalLegal: 100, semanticEligible: 0, hardConstraintPassed: 0, bracketQualityPassed: 2, positiveBlueprintDelta: 0, searchSpaceExhausted: true, tiers: [], sourcesAttempted: [], rejectionBreakdown: {} } }), "BLUEPRINT_DENSITY_CHALLENGE");
  console.log("PASS terminal classification mapping");
}

function main() {
  testAccessPortfolioNormalization();
  testRelationalAccessTruth();
  testOneToolThreeRoutesNotThreeTools();
  testDynamicManaFrontier62Plus37();
  testNoLandPaddingWhenMandatoryDeficit();
  testTerminalClassifications();
  console.log("\nALL SLICE 5.4 SELFTESTS PASS");
}

main();
