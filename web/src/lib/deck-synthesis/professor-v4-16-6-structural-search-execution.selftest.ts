/**
 * PROFESSOR v4.16.6 — cheap acceptance (no OpenAI, no commander #7).
 */
import assert from "node:assert/strict";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import {
  buildAggregatedMissionsV4166,
  buildStructuralCompletionPlanV4166,
  assessAccessToolTargetSplitV4166,
  assessStructuralCoverageV4166,
  resolveBuildPhaseV4166,
} from "./professor-structural-search-planner-v4-16-6-v1";
import {
  buildExhaustionEvidenceV4166,
  executeStructuralSearchV4166,
  reconcileCandidateSupplyV4166,
  validateAllTooLowQualityEvidence,
} from "./professor-structural-search-execution-v4-16-6-v1";
import {
  recomputeSafetyCheckV4166,
  updateStructuralBuildTelemetryV4166,
} from "./professor-structural-build-telemetry-v4-16-6-v1";
import { assessTheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
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

function theoryWithUnrealizedCore() {
  return {
    commander: "Beledros Witherbloom",
    packages: [
      {
        packageId: "pkg-token-synergy",
        name: "Token Synergy",
        purpose: "Sacrifice payoff",
        status: "CORE" as const,
        candidateCards: ["Carrion Feeder", "Bitterblossom"],
      },
    ],
  };
}

function run() {
  const earlyDeck = [
    card("Worldly Tutor", "oid-worldly", ["access", "tutor"]),
    card("Vampiric Tutor", "oid-vamp", ["access", "tutor"]),
    card("Entomb", "oid-entomb", ["access", "interaction"]),
    ...Array.from({ length: 8 }, (_, i) => card(`Spell ${i}`, `oid-${i}`, ["engine"])),
  ];
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 34, structuralNonLandTarget: 65, reservedLandSlots: 34 } as never,
    selectedCards: earlyDeck,
  });
  assert.equal(slotBudget.selectedNonlands, 11);

  const phase = resolveBuildPhaseV4166({ slotBudget, stallDetected: false, terminalExhaustion: false });
  assert.equal(phase, "EARLY_ASSEMBLY", "11/65 nonlands must be EARLY_ASSEMBLY not structural closure");

  const plan = buildStructuralCompletionPlanV4166({
    slotBudget,
    selectedCards: earlyDeck,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryWithUnrealizedCore() as never, selectedCards: earlyDeck }),
    requestedBracket: 4,
    stallDetected: false,
    terminalExhaustion: false,
  });
  assert.equal(plan.buildPhase, "EARLY_ASSEMBLY");
  assert.equal(plan.action, "CONTINUE_NORMAL_ASSEMBLY");
  assert.equal(plan.missions.length, 0, "Early assembly must not spawn 54 one-card missions");

  const accessSplit = assessAccessToolTargetSplitV4166({
    selectedCards: earlyDeck,
    theoryRealizations: plan.coverage.length ? assessTheoryRealizationV4165({ theory: theoryWithUnrealizedCore() as never, selectedCards: earlyDeck }) : [],
  });
  assert.ok(accessSplit.accessToolCoverage >= 2, "Access tools in deck must be counted");

  const coverage = assessStructuralCoverageV4166({ selectedCards: earlyDeck, requestedBracket: 4 });
  const accessCov = coverage.find((c) => c.function === "access-tools");
  assert.ok((accessCov?.currentCount ?? 0) >= 2);

  let tel = updateStructuralBuildTelemetryV4166({
    prior: null,
    slotBudget,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryWithUnrealizedCore() as never, selectedCards: earlyDeck }),
    selectedCards: earlyDeck,
    candidatePool: [card("Swords to Plowshares", "oid-swords", ["interaction", "removal"])],
    requestedBracket: 4,
    commanderColorIdentity: ["B", "G"],
    catalog: null,
    recordExecution: false,
  });
  const tel2 = updateStructuralBuildTelemetryV4166({
    prior: tel,
    slotBudget,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryWithUnrealizedCore() as never, selectedCards: earlyDeck }),
    selectedCards: earlyDeck,
    candidatePool: [card("Swords to Plowshares", "oid-swords", ["interaction", "removal"])],
    requestedBracket: 4,
    commanderColorIdentity: ["B", "G"],
    catalog: null,
    recordExecution: false,
  });
  const safety = recomputeSafetyCheckV4166(tel, tel2);
  assert.equal(safety.recomputeNoOpCount, 0);
  assert.equal(safety.terminated, false, "Two identical recomputes must not terminate");

  const stalledPlan = buildStructuralCompletionPlanV4166({
    slotBudget,
    selectedCards: earlyDeck,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryWithUnrealizedCore() as never, selectedCards: earlyDeck }),
    requestedBracket: 4,
    stallDetected: true,
    terminalExhaustion: false,
  });
  assert.ok(stalledPlan.missions.length > 0 && stalledPlan.missions.length < 20, "Stalled recovery uses aggregated missions not 54 slots");
  assert.ok(stalledPlan.missions.some((m) => m.missionId.includes("realize-core-package")), "UNREALIZED CORE prioritized");

  const mission = stalledPlan.missions[0]!;
  const execution = executeStructuralSearchV4166({
    executionId: "exec-1",
    mission,
    candidatePool: [
      card("Path to Exile", "oid-path", ["interaction", "removal"]),
      card("Lightning Bolt", "oid-bolt", ["interaction", "removal"]),
    ],
    selectedCards: earlyDeck,
    catalog: null,
    commanderColorIdentity: ["B", "G"],
    requestedBracket: 4,
  });
  assert.ok(execution.candidatesConsidered.length > 0);
  const supply = reconcileCandidateSupplyV4166({
    execution,
    considered: execution.candidatesConsidered,
    neededSlots: mission.desiredSlots.max,
  });
  assert.equal(supply.retrieved, supply.candidatesConsidered.length);
  assert.ok(supply.retrieved === supply.canonicalUnresolved + supply.illegal + supply.wrongFunction + supply.belowQualityFloor + supply.alreadySelected + supply.viableCandidateCount);

  const emptyEvidence = buildExhaustionEvidenceV4166({ executions: [] });
  assert.equal(emptyEvidence.validForTerminalExhaustion, false);
  assert.ok(emptyEvidence.invalidReason);

  const partialEvidence = buildExhaustionEvidenceV4166({ executions: [execution], applicableTiers: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(partialEvidence.validForTerminalExhaustion, false, "Only tier 1 executed — terminal exhaustion forbidden");
  assert.ok(partialEvidence.unexploredSearchSpaces.length > 0);

  assert.equal(validateAllTooLowQualityEvidence([]), true);
  assert.throws(() => assertManaBaseAllowedV4165({ structurallyComplete: false }), /RUN_MANA_BASE blocked/);

  tel = updateStructuralBuildTelemetryV4166({
    prior: { ...tel2, stallDetected: true, buildPhase: "STALLED_RECOVERY" },
    slotBudget,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryWithUnrealizedCore() as never, selectedCards: earlyDeck }),
    selectedCards: earlyDeck,
    candidatePool: [card("Path to Exile", "oid-path", ["interaction", "removal"])],
    requestedBracket: 4,
    commanderColorIdentity: ["B", "G"],
    catalog: null,
    recordExecution: true,
  });
  assert.ok(tel.executions.length >= 1);
  assert.equal(tel.recomputeNoOpCount, 0);

  console.log("PROFESSOR v4.16.6 structural search execution phase-aware recovery — PASS");
}

run();
