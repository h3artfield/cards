/**
 * PROFESSOR v4.16.2 — deterministic acceptance (no OpenAI prospective).
 */
import assert from "node:assert/strict";
import { countGameChangersInDeckV4162, isCanonicalGameChangerCardV4162 } from "./professor-game-changer-registry-v4-16-2-v1";
import {
  executeBracketPowerSearchMissionV416,
  planPowerSearchMissionsV416,
  type BracketPowerSearchHistoryV416,
} from "./professor-bracket-power-search-mission-v4-16-v1";
import { evaluateBracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import { sanitizeCharterProvenanceV4162, assertCharterConceptSupportedV4162 } from "./professor-charter-provenance-v4-16-2-v1";
import { assessB4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import { rankB4OpportunityCostCandidatesV4162 } from "./professor-b4-opportunity-cost-v4-16-2-v1";
import { buildProfessorRefinementPlanV415 } from "./professor-refinement-plan-v4-15-v1";
import {
  professorBrewCanEnterFinalizationV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsBracketResearchV416,
} from "./professor-brew-progress-v4-7-v1";
import { assessBracketReadinessV416 } from "./professor-bracket-readiness-v4-16-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";

function card(name: string, oracleId?: string, roles: string[] = []): CouncilCardV46 {
  return {
    cardId: `card-${oracleId ?? name.replace(/\s+/g, "-").toLowerCase()}`,
    oracleId: oracleId ?? `oid-${name.replace(/\s+/g, "-").toLowerCase()}`,
    name,
    category: "spell",
    roles,
    origin: "GOLDEN_CATALOG",
    proposedBy: "RESEARCH",
    status: "SELECTED",
    oracleVerified: true,
    colorIdentityVerified: true,
    legalityVerified: true,
    addedAtRevision: 1,
    lastReviewedRevision: 1,
  };
}

function charter(overrides: Partial<DeckCharterV45> = {}): DeckCharterV45 {
  return {
    commander: "Test Commander",
    requestedBracket: 4,
    playStyle: "Optimized",
    commanderRelationship: "Harmony",
    deckIdentity: "Legendary synergy deck",
    playerIntentSummary: "B4 optimized",
    primaryStrategy: "Legendary Creature Synergy",
    secondaryStrategy: "Cost Reduction",
    commanderDependentEngine: "Legendary payoffs",
    independentEngine: "Backup engine",
    harmonyPlan: "Legendary and cost reduction share slots.",
    intendedWinPaths: ["Compact legendary board pressure"],
    expectedPlayPattern: "Fast midrange",
    bracketConstraints: "B4",
    comboPolicy: "Secondary",
    tutorPolicy: "Allowed",
    designRules: [],
    avoidPatterns: [],
    researchPriorities: ["Efficient legendary creatures"],
    ...overrides,
  };
}

function sessionWithReadiness(canEnterFinalization: boolean): BrewSessionV42 {
  return {
    sessionId: "test",
    mode: "live",
    bracket: 4,
    userIntent: [],
    deckList: [],
    deckListRevealCount: 0,
    councilState: {
      selectedCards: Array.from({ length: 99 }, (_, i) => card(`Card ${i}`, `oid-${i}`)),
      bracketReadinessV416: {
        version: "professor-bracket-readiness-v4-16-v1",
        requestedBracket: 4,
        currentPredictedBracket: 4,
        criticalDeficits: canEnterFinalization ? [] : ["GAME_CHANGERS: CRITICAL"],
        readiness: canEnterFinalization ? "READY" : "NEEDS_RESEARCH",
        canEnterFinalization,
        bracketPowerUtilization: "HIGH",
        manaPlanValid: true,
        message: canEnterFinalization ? "ok" : "blocked",
        carryForwardFlag: null,
      },
    },
  } as BrewSessionV42;
}

function run(): void {
  assert.equal(
    isCanonicalGameChangerCardV4162({ name: "Sol Ring", oracleId: "oid-sol-ring" }),
    false,
    "Sol Ring is not on the official Game Changer list",
  );
  assert.equal(
    isCanonicalGameChangerCardV4162({ name: "Worldly Tutor" }),
    true,
    "Worldly Tutor must resolve as canonical Game Changer",
  );

  const gcDeck = [
    card("Worldly Tutor", "oid-worldly"),
    card("Enlightened Tutor", "oid-enlightened"),
    card("Forest", "oid-forest"),
  ];
  assert.ok(countGameChangersInDeckV4162({ selectedCards: gcDeck }) >= 2, "GC count must reflect cards in deck");

  const contract = {
    version: "professor-bracket-construction-contract-v4-16-v1",
    requestedBracket: 4 as const,
    bracketIntent: "EXPLOIT_CEILING",
    targetThreatWindow: "fast",
    targetConsistency: "high",
    targetEfficiency: "high",
    targetInteractionQuality: "high",
    targetAccelerationQuality: "high",
    targetAccessQuality: "high",
    targetWinCompactness: "high",
    availablePowerLevers: ["ACCESS", "GAME_CHANGERS"],
    prohibitedPowerLevers: [],
    conditionalPowerLevers: [],
    ceilingRules: [],
    floorExpectations: [],
    powerLeverRules: [],
    primaryWinArchitectureDueByCard: 35,
    accessArchitectureRequired: true,
    gameChangerReviewRequired: true,
    optimizationObjective: "test",
  };
  const portfolioWithGc = evaluateBracketPowerPortfolioV416({
    contract,
    powerPlan: null,
    selectedCards: gcDeck,
    profiles: [],
    gap: null,
    gameChangerCount: 2,
  });
  assert.ok(!portfolioWithGc.criticalDeficits.includes("GAME_CHANGERS"), "Portfolio must not CRITICAL when GC present");

  const history: BracketPowerSearchHistoryV416 = {
    candidatesAlreadyConsidered: ["Worldly Tutor", "Enlightened Tutor"],
    candidatesAlreadySelected: ["Worldly Tutor"],
    candidatesAlreadyRejected: [],
    completedMissionKinds: ["FIND_RELEVANT_GAME_CHANGERS"],
    gameChangerReviewComplete: true,
  };
  const missions = planPowerSearchMissionsV416({
    portfolio: evaluateBracketPowerPortfolioV416({
      contract,
      powerPlan: null,
      selectedCards: gcDeck,
      profiles: [],
      gap: null,
      gameChangerCount: 2,
    }),
    contract,
    history,
  });
  assert.ok(
    !missions.some((m) => m.kind === "FIND_RELEVANT_GAME_CHANGERS"),
    "Duplicate GC mission must be suppressed after review complete",
  );

  const contaminated = charter({
    harmonyPlan: "Lifegain and commander scaling should share cards where possible",
    researchPriorities: ["Role-compressed lifegain effects", "Legendary creatures"],
  });
  assert.equal(assertCharterConceptSupportedV4162(contaminated, "lifegain"), false);
  const cleaned = sanitizeCharterProvenanceV4162(contaminated);
  assert.ok(cleaned.removedConcepts.length > 0, "Unsupported lifegain must be removed from charter");
  assert.ok(!/lifegain/i.test(cleaned.charter.harmonyPlan), "Cleaned harmonyPlan must not mention lifegain");

  const win = assessB4WinReadinessV4161({
    requestedBracket: 4,
    selectedCards: [card("Doorman", "oid-doorman", ["finisher"])],
    charter: charter({
      intendedWinPaths: ["Overwhelm opponents with a large board of buffed legendary creatures"],
    }),
    legality: null,
  });
  assert.equal(win.concreteLineReady, false, "Generic combat overwhelm must not pass concrete line gate");

  const opp = rankB4OpportunityCostCandidatesV4162({
    selectedCards: [card("Doorman", "oid-doorman"), card("Sol Ring", "oid-sol")],
    charter: charter(),
    requestedBracket: 4,
  });
  assert.ok(opp.b4PowerUtilizationGap, "Doorman in B4 deck must flag utilization gap");

  const plan = buildProfessorRefinementPlanV415({
    review: {
      weakCards: [],
      opportunityCostCards: [],
      weakPackages: [],
      preserveAtAllCosts: [],
      swaps: [],
      researchRequests: [],
      requiresMajorRevision: true,
      predictedEffectiveBracket: 3,
      b3ToB4GapExplanation: "gap",
      currentWinArchitecture: { compactnessScore: 4 },
    } as never,
    requestedBracket: 4,
    architectureProposal: null,
  });
  assert.ok(plan.phases.length > 0, "Major revision must produce non-empty refinement plan");
  assert.ok(plan.researchQuestions.length > 0, "Major revision must produce research questions");

  const blockedSession = sessionWithReadiness(false);
  assert.equal(professorBrewCanEnterFinalizationV416(blockedSession), false);
  assert.equal(professorBrewNeedsFinalReviewV48(blockedSession), false);
  assert.equal(professorBrewNeedsBracketResearchV416(blockedSession), true);

  const ready = assessBracketReadinessV416({
    requestedBracket: 4,
    portfolio: {
      ...portfolioWithGc,
      criticalDeficits: [],
      highDeficits: [],
    },
    gap: { predictedBracket: 4, currentlyEstimatedBracket: 4, unresolvedHighDeficits: [] } as never,
    manaPlan: { structuralNonLandTarget: 65, reservedLandSlots: 35 } as never,
    selectedNonLandCount: 2,
    legality: null,
    utilization: { bracketReady: true, belowTargetDimensions: [] } as never,
    winReadiness: { ready: true, concreteLineReady: true } as never,
    quality: { qualityReady: true, failingDimensions: [] } as never,
  });
  assert.equal(ready.canEnterFinalization, true, "Ready portfolio should allow finalization");

  console.log(
    JSON.stringify(
      {
        test: "professor-v4-16-2-bracket-readiness-truth",
        status: "PASS",
        checks: [
          "gc_in_deck_count",
          "gc_mission_dedup",
          "finalization_gate",
          "charter_provenance",
          "concrete_win_line",
          "opportunity_cost_gap",
          "major_revision_plan",
        ],
      },
      null,
      2,
    ),
  );
}

run();
