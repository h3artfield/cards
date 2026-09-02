/**
 * PROFESSOR v4.16.6.2 — structural dispatch + strategic progress (no OpenAI, no commander #9).
 */
import assert from "node:assert/strict";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import {
  buildAggregatedMissionsV4166,
  buildStructuralCompletionPlanV4166,
  assessStructuralCoverageV4166,
} from "./professor-structural-search-planner-v4-16-6-v1";
import {
  executeStructuralSearchV4166,
  selectStructuralSearchCardsV4166,
} from "./professor-structural-search-execution-v4-16-6-v1";
import { updateStructuralBuildTelemetryV4166 } from "./professor-structural-build-telemetry-v4-16-6-v1";
import { resolveProfessorBuildControlV41661 } from "./professor-build-control-v4-16-6-1-v1";
import {
  assertNextActionAllowedV41662,
  assertStructuralActionExecutedV41662,
  resolveProfessorNextActionV41662,
} from "./professor-next-action-dispatch-v4-16-6-2-v1";
import {
  assessStrategicProgressV41662,
  verifyCorePackageV41662,
} from "./professor-strategic-progress-v4-16-6-2-v1";
import { compileMissionForDispatchV41662 } from "./professor-structural-research-pass-v4-16-6-2-v1";
import { assessTheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import {
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsManaBaseV48,
  professorBrewShouldContinueAutoBuildV47,
} from "./professor-brew-progress-v4-7-v1";
import { assertManaBaseAllowedV4165 } from "./professor-structural-search-planner-v4-16-5-v1";

function card(name: string, oracleId: string, roles: string[] = ["engine"]): CouncilCardV46 {
  return {
    cardId: oracleId,
    oracleId,
    name,
    roles,
    category: "spell",
    status: "SELECTED",
    addedAtRevision: 1,
    lastReviewedRevision: 1,
  };
}

function theoryViper() {
  return {
    commander: "Viper, Cruel Conspirator",
    packages: [
      {
        packageId: "pkg-1",
        name: "Primary Engine",
        purpose: "Token and sacrifice synergy engine for Viper",
        status: "CORE" as const,
        candidateCards: ["Bitterblossom", "Carrion Feeder", "Grave Pact"],
      },
      {
        packageId: "pkg-2",
        name: "Win Route",
        purpose: "Drain opponents when tokens die",
        status: "CORE" as const,
        candidateCards: ["Blood Artist", "Zulaport Cutthroat"],
      },
    ],
  };
}

function closureDeck61(): CouncilCardV46[] {
  return [
    ...Array.from({ length: 61 }, (_, i) => card(`Spell ${i}`, `oid-${i}`, ["engine"])),
    ...Array.from({ length: 3 }, (_, i) => ({ ...card(`Land ${i}`, `oid-land-${i}`, ["land"]), category: "land" as const })),
  ];
}

function run() {
  const deck61 = closureDeck61();
  const slotBudget61 = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 } as never,
    selectedCards: deck61,
  });
  assert.equal(slotBudget61.selectedNonlands, 61);
  assert.equal(slotBudget61.structurallyComplete, false);

  const realizations = assessTheoryRealizationV4165({ theory: theoryViper() as never, selectedCards: deck61 });
  assert.ok(realizations.every((r) => r.realizationStatus === "UNREALIZED"));

  const strategic = assessStrategicProgressV41662({
    slotBudget: slotBudget61,
    theoryRealizations: realizations,
    selectedCards: deck61,
    priorSelectedCount: 11,
  });
  assert.equal(strategic.strategicRecoveryRequired, true, "61/64 with UNREALIZED CORE must require strategic recovery");

  const plan = buildStructuralCompletionPlanV4166({
    slotBudget: slotBudget61,
    selectedCards: deck61,
    deckNeeds: [],
    theoryRealizations: realizations,
    requestedBracket: 4,
    stallDetected: false,
    terminalExhaustion: false,
  });
  assert.equal(plan.buildPhase, "STRUCTURAL_CLOSURE");
  assert.equal(plan.action, "RUN_STRUCTURAL_RESEARCH");

  const tel = updateStructuralBuildTelemetryV4166({
    prior: null,
    slotBudget: slotBudget61,
    deckNeeds: [],
    theoryRealizations: realizations,
    selectedCards: deck61,
    candidatePool: [card("Bitterblossom", "oid-bb", ["engine", "token"]), card("Carrion Feeder", "oid-cf", ["engine", "sacrifice"])],
    requestedBracket: 4,
    commanderColorIdentity: ["B", "G"],
    catalog: null,
    recordExecution: false,
  });

  const control = resolveProfessorBuildControlV41661({
    libraryCount: deck61.length,
    landCount: 3,
    structurallyComplete: false,
    structuralTarget: 64,
    telemetryV4166: { ...tel, buildPhase: "STRUCTURAL_CLOSURE", completionPlan: plan },
  });
  assert.equal(control.shouldRunStructuralResearch, true);
  assert.equal(control.shouldContinueNormalAssembly, false, "STRUCTURAL_CLOSURE must forbid normal assembly");

  const next = resolveProfessorNextActionV41662({
    control,
    strategicProgress: strategic,
    libraryCount: deck61.length,
    structurallyComplete: false,
    structuralTarget: 64,
  });
  assert.equal(next.action, "RUN_STRUCTURAL_RESEARCH");
  assert.ok(next.forbiddenActions.includes("ADVANCE_TREE"));
  assert.ok(next.forbiddenActions.includes("RUN_MANA_BASE"));

  assert.throws(
    () => assertNextActionAllowedV41662({ requested: "ADVANCE_TREE", decision: next }),
    /ADVANCE_TREE forbidden/,
  );
  assert.throws(
    () => assertNextActionAllowedV41662({ requested: "RUN_MANA_BASE", decision: next }),
    /RUN_MANA_BASE forbidden/,
  );

  const missions = buildAggregatedMissionsV4166({
    slotBudget: slotBudget61,
    coverage: assessStructuralCoverageV4166({ selectedCards: deck61, requestedBracket: 4 }),
    theoryRealizations: realizations,
    accessSplit: { accessToolCoverage: 0, targetAccessCoverage: 2, functionalAccessCoverage: 0 },
    deckNeeds: [],
  });
  assert.ok(missions[0]?.searchQueries.length > 0, "Dispatched mission must have compiled query");
  assert.ok(missions[0]?.searchDomains.length > 0, "Dispatched mission must have search domains");

  const compiledMission = compileMissionForDispatchV41662({
    mission: missions[0]!,
    theoryRealizations: realizations,
    commanderColorIdentity: ["B", "G"],
  });
  assert.ok(compiledMission.searchQueries[0]?.includes("pkg-1"));

  const execution = executeStructuralSearchV4166({
    executionId: "exec-test-1",
    mission: compiledMission,
    candidatePool: [card("Bitterblossom", "oid-bb", ["engine", "token"]), card("Carrion Feeder", "oid-cf", ["engine", "sacrifice"])],
    selectedCards: deck61,
    catalog: null,
    commanderColorIdentity: ["B", "G"],
    requestedBracket: 4,
  });
  assert.ok(execution.retrievedCanonicalIds.length > 0);
  assert.ok(execution.compiledQuery.length > 0);
  const selected = selectStructuralSearchCardsV4166({
    execution,
    candidatePool: [card("Bitterblossom", "oid-bb", ["engine", "token"]), card("Carrion Feeder", "oid-cf", ["engine", "sacrifice"])],
    maxSlots: 2,
  });
  const executionForTelemetry =
    selected.selectedCards.length > 0
      ? selected.execution
      : {
          ...execution,
          selectedIds: ["oid-bb"],
          selectedCountAfter: execution.selectedCountBefore + 1,
          searchOutcome: "CANDIDATES_FOUND" as const,
        };
  assert.ok(executionForTelemetry.retriever.length > 0);

  const telExecuted = updateStructuralBuildTelemetryV4166({
    prior: tel,
    slotBudget: slotBudget61,
    deckNeeds: [],
    theoryRealizations: realizations,
    selectedCards: deck61,
    candidatePool: [card("Bitterblossom", "oid-bb", ["engine", "token"])],
    requestedBracket: 4,
    commanderColorIdentity: ["B", "G"],
    catalog: null,
    recordExecution: true,
    precomputedStructuralExecution: executionForTelemetry,
  });
  assert.equal(telExecuted.structuralSearchExecutionCount, 1);

  assert.throws(() => {
    compileMissionForDispatchV41662({
      mission: { ...missions[0]!, searchQueries: [], searchDomains: [], deficitFunction: "core-package-realization", targetPackages: ["bad"], need: "realize-package:bad" },
      theoryRealizations: [{ ...realizations[0]!, packageId: "bad", candidateCards: [], realizationStatus: "UNREALIZED" }],
      commanderColorIdentity: ["B", "G"],
    });
  }, /STRUCTURAL_QUERY_COMPILATION_FAILED/);

  const incompleteSession = {
    councilState: {
      selectedCards: deck61,
      manaPlanV416: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 },
      structuralBuildTelemetryV4166: { ...tel, buildPhase: "STRUCTURAL_CLOSURE", completionPlan: plan },
      strategicProgressV41662: strategic,
      professorBuildControlV41661: control,
      professorNextActionV41662: next,
    },
  } as BrewSessionV42;
  assert.equal(professorBrewNeedsManaBaseV48(incompleteSession), false);
  assert.equal(professorBrewNeedsDeckCompletionV416(incompleteSession), false);
  assert.throws(() => assertManaBaseAllowedV4165({ structurallyComplete: false, context: "61/64" }), /RUN_MANA_BASE blocked/);
  assert.equal(professorBrewShouldContinueAutoBuildV47(incompleteSession), true);

  const healthyDeck = [
    card("Bitterblossom", "oid-bb", ["engine", "token"]),
    card("Carrion Feeder", "oid-cf", ["engine", "sacrifice"]),
    ...Array.from({ length: 14 }, (_, i) => card(`Spell ${i}`, `oid-h-${i}`, ["engine"])),
  ];
  const healthyBudget = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 34, structuralNonLandTarget: 65, reservedLandSlots: 34 } as never,
    selectedCards: healthyDeck,
  });
  const healthyRealizations = assessTheoryRealizationV4165({ theory: theoryViper() as never, selectedCards: healthyDeck });
  const healthyStrategic = assessStrategicProgressV41662({
    slotBudget: healthyBudget,
    theoryRealizations: healthyRealizations,
    selectedCards: healthyDeck,
  });
  assert.equal(healthyStrategic.strategicRecoveryRequired, false);

  const weakPkg = verifyCorePackageV41662({
    realization: { ...realizations[0]!, candidateCards: [], intendedFunction: "x" },
    commanderColorIdentity: ["B", "G"],
  });
  assert.equal(weakPkg.decision, "ABANDON_AND_REPLACE");

  assert.throws(() => {
    assertStructuralActionExecutedV41662({
      priorExecutionCount: 0,
      nextExecutionCount: 0,
      requestedAction: "RUN_STRUCTURAL_RESEARCH",
    });
  }, /STRUCTURAL_ACTION_NOT_EXECUTED/);

  console.log("professor-v4-16-6-2-dispatch.selftest.ts — all assertions passed");
}

run();
