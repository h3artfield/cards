/**
 * PROFESSOR v4.16.5 — structural search planner cheap acceptance (no OpenAI, no commander #6).
 */
import assert from "node:assert/strict";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import {
  assertManaBaseAllowedV4165,
  buildLoopFingerprintV4165,
  buildStructuralCompletionPlanV4165,
  buildStructuralSearchMissionsV4165,
  escalateStructuralMissionV4165,
  evaluateBuildLoopTerminationV4165,
  hashCandidateSet,
  tierDomainChanged,
} from "./professor-structural-search-planner-v4-16-5-v1";
import {
  updateStructuralBuildTelemetryV4165,
  shouldRunStructuralResearchV4165,
} from "./professor-structural-build-telemetry-v4-16-5-v1";
import {
  assessTheoryRealizationV4165,
  unrealizedCorePackages,
} from "./professor-theory-realization-v4-16-5-v1";
import { buildAccessArchitectureV4165 } from "./professor-verified-access-route-v4-16-5-v1";
import { assessProspectiveAcceptanceSemanticsV4165 } from "./professor-acceptance-semantics-v4-16-5-v1";
import { professorBrewShouldContinueAutoBuildV47 } from "./professor-brew-progress-v4-7-v1";
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";

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

function charter(): DeckCharterV45 {
  return {
    commander: "Jennifer Walters // The Sensational She-Hulk",
    primaryStrategy: "Combo",
    playStyle: "Optimized",
    commanderRelationship: "HARMONY",
    requestedBracket: 4,
  } as DeckCharterV45;
}

function theoryWithUnrealizedCore(): WorkingDeckTheoryV4 {
  return {
    commander: "Jennifer Walters // The Sensational She-Hulk",
    packages: [
      {
        packageId: "core-tutor-engine",
        name: "Tutor Engine",
        purpose: "Find combo pieces",
        status: "CORE",
        candidateCards: ["Diabolic Intent", "Demonic Tutor", "Vampiric Tutor"],
      },
    ],
  } as WorkingDeckTheoryV4;
}

function run() {
  const slotBudget60 = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 } as never,
    selectedCards: Array.from({ length: 60 }, (_, i) => card(`Spell ${i}`, `oid-${i}`, ["engine"])),
  });
  assert.equal(slotBudget60.structurallyComplete, false);
  assert.equal(slotBudget60.remainingNonlandSlots, 4);

  assert.throws(
    () => assertManaBaseAllowedV4165({ structurallyComplete: false, context: "test" }),
    /RUN_MANA_BASE blocked/,
    "Mana hard gate must throw when structurally incomplete",
  );

  const realizations = assessTheoryRealizationV4165({
    theory: theoryWithUnrealizedCore(),
    selectedCards: Array.from({ length: 10 }, (_, i) => card(`Spell ${i}`, `oid-${i}`)),
  });
  assert.equal(realizations[0]?.realizationStatus, "UNREALIZED");
  assert.ok(unrealizedCorePackages(realizations).length === 1);

  const missions = buildStructuralSearchMissionsV4165({
    slotBudget: slotBudget60,
    deckNeeds: [{ needId: "access", status: "OPEN" } as never],
    theoryRealizations: realizations,
  });
  assert.ok(missions.length >= 4, "Each missing slot/group must map to a mission");
  assert.ok(missions.some((m) => m.missionId.includes("theory")), "UNREALIZED CORE must spawn theory mission");

  const plan = buildStructuralCompletionPlanV4165({
    slotBudget: slotBudget60,
    deckNeeds: [{ needId: "access", status: "OPEN" } as never],
    theoryRealizations: realizations,
  });
  assert.equal(plan?.action, "RUN_STRUCTURAL_RESEARCH");

  const mission = missions[0]!;
  const tier1Query = mission.searchQueries[0]!;
  const tier1Domain = mission.searchDomains[0]!;
  const escalated = escalateStructuralMissionV4165({
    mission,
    rejectionReason: "ALL_WRONG_FUNCTION",
    candidatesNewToMission: 0,
  });
  assert.ok(tierDomainChanged(escalated.currentTier, mission.currentTier), "Escalation must change domain");
  assert.notEqual(escalated.searchQueries.at(-1), tier1Query);
  assert.notEqual(escalated.searchDomains.at(-1), tier1Domain);
  assert.ok(escalated.domainDiffs[0]?.zeroNewCandidatesReason);

  const fp1 = buildLoopFingerprintV4165({
    selectedCardCount: 60,
    missions,
    candidatePoolNames: ["A", "B", "C"],
  });
  const fp2 = buildLoopFingerprintV4165({
    selectedCardCount: 60,
    missions,
    candidatePoolNames: ["A", "B", "C"],
  });
  const termination = evaluateBuildLoopTerminationV4165({
    priorFingerprint: fp1,
    currentFingerprint: fp2,
    missions,
  });
  assert.equal(termination.shouldTerminate, true);
  assert.equal(termination.terminalState, "BUILD_FAILED_CANDIDATE_EXHAUSTION");
  assert.equal(termination.normalBuildDisabled, true);

  let telemetry = updateStructuralBuildTelemetryV4165({
    prior: null,
    slotBudget: slotBudget60,
    deckNeeds: [{ needId: "access", status: "OPEN" } as never],
    theoryRealizations: realizations,
    selectedCards: Array.from({ length: 60 }, (_, i) => card(`Spell ${i}`, `oid-${i}`)),
    candidatePool: [card("Opt", "oid-opt", ["interaction"])],
  });
  telemetry = updateStructuralBuildTelemetryV4165({
    prior: telemetry,
    slotBudget: slotBudget60,
    deckNeeds: [{ needId: "access", status: "OPEN" } as never],
    theoryRealizations: realizations,
    selectedCards: Array.from({ length: 60 }, (_, i) => card(`Spell ${i}`, `oid-${i}`)),
    candidatePool: [card("Opt", "oid-opt", ["interaction"])],
  });
  telemetry = updateStructuralBuildTelemetryV4165({
    prior: telemetry,
    slotBudget: slotBudget60,
    deckNeeds: [{ needId: "access", status: "OPEN" } as never],
    theoryRealizations: realizations,
    selectedCards: Array.from({ length: 60 }, (_, i) => card(`Spell ${i}`, `oid-${i}`)),
    candidatePool: [card("Opt", "oid-opt", ["interaction"])],
  });
  assert.equal(telemetry.consecutiveIdenticalPasses, 2);
  assert.equal(telemetry.termination?.shouldTerminate, true);
  assert.equal(shouldRunStructuralResearchV4165({ slotBudget: slotBudget60, telemetry }), false);

  const access = buildAccessArchitectureV4165({
    selectedCards: Array.from({ length: 10 }, (_, i) => card(`Spell ${i}`, `oid-${i}`)),
    charter: charter(),
    theory: theoryWithUnrealizedCore(),
    catalog: null,
  });
  assert.equal(access.accessReadiness, "THEORY_UNREALIZED");
  assert.equal(access.criticalAccessFailure, true);

  const accessEmpty = buildAccessArchitectureV4165({
    selectedCards: [],
    charter: charter(),
    theory: null,
    catalog: null,
  });
  assert.equal(accessEmpty.accessReadiness, "NOT_READY");

  const exhaustedSession = {
    fixtureCase: false,
    councilState: {
      buildPhase: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
      selectedCards: Array.from({ length: 60 }, (_, i) => card(`Spell ${i}`, `oid-${i}`)),
      structuralBuildTelemetryV4165: telemetry,
      structuralBuildTelemetryV4166: {
        buildPhase: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
        termination: {
          shouldTerminate: true,
          terminalState: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
          reason: "v4166 execution-backed exhaustion",
        },
        completionPlan: { action: "TERMINATE_EXHAUSTED" },
      },
    },
  } as BrewSessionV42;
  assert.equal(professorBrewShouldContinueAutoBuildV47(exhaustedSession), false);

  const substitutionMission = escalateStructuralMissionV4165({
    mission: { ...mission, currentTier: 6 },
    rejectionReason: "ALL_ALREADY_SELECTED",
    candidatesNewToMission: 0,
  });
  assert.equal(substitutionMission.currentTier, 7);
  assert.equal(substitutionMission.searchDomains.at(-1), "functional_substitution");

  assert.notEqual(hashCandidateSet(["A"]), hashCandidateSet(["B"]));

  const acceptance = assessProspectiveAcceptanceSemanticsV4165({
    headProfessorExecuted: false,
    refinementExecuted: false,
    buildStalled: true,
    canonicalTruthResolved: true,
    accessMechanicallyVerified: true,
    accessReadinessReady: false,
    accessTheoryUnrealized: true,
    winMechanicallyVerified: false,
    winCorrectlyBlocked: true,
    opportunityCostLegal: true,
    structuralComplete: false,
    searchEscalationGenuine: false,
    noOpTerminationEnforced: false,
    manaGatingEnforced: false,
    realizedPowerTruthPass: true,
    productComplete: false,
  });
  assert.equal(acceptance.canonicalCardTruth, "PASS");
  assert.equal(acceptance.accessQuality, "FAIL");
  assert.equal(acceptance.winMechanics, "PASS_CORRECT_BLOCK");
  assert.equal(acceptance.structuralCompletion, "FAIL");
  assert.equal(acceptance.searchEscalation, "FAIL");
  assert.equal(acceptance.noOpTermination, "FAIL");
  assert.equal(acceptance.manaGating, "FAIL");
  assert.equal(acceptance.product, "FAIL");

  console.log("PROFESSOR v4.16.5 structural search planner acceptance — PASS");
}

run();
