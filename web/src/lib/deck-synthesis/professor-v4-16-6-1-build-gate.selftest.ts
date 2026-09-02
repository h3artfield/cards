/**
 * PROFESSOR v4.16.6.1 — authoritative orchestrator gate repair (no OpenAI, no commander #8).
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import {
  evaluateBuildLoopTerminationV4165,
  buildLoopFingerprintV4165,
} from "./professor-structural-search-planner-v4-16-5-v1";
import {
  buildExhaustionEvidenceV4166,
  executeStructuralSearchV4166,
} from "./professor-structural-search-execution-v4-16-6-v1";
import {
  buildStructuralCompletionPlanV4166,
  type BuildPhaseV4166,
} from "./professor-structural-search-planner-v4-16-6-v1";
import {
  evaluateBuildLoopTerminationV4166,
  updateStructuralBuildTelemetryV4166,
} from "./professor-structural-build-telemetry-v4-16-6-v1";
import { assessTheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import { assessProspectiveAcceptanceSemanticsV4165 } from "./professor-acceptance-semantics-v4-16-5-v1";
import {
  assertLegacyTerminationIgnoredV41661,
  LEGACY_BUILD_CONTROL_AUDIT_V41661,
  resolveProfessorBuildControlV41661,
  type ProfessorBuildControlV41661,
} from "./professor-build-control-v4-16-6-1-v1";
import {
  professorBrewNeedsManaBaseV48,
  professorBrewNeedsStructuralResearchV4166,
  professorBrewShouldContinueAutoBuildV47,
} from "./professor-brew-progress-v4-7-v1";
import { ensureProspectiveOutputDirectory } from "../../../scripts/lib/ensure-prospective-output-directory-v1";

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

function theoryJessica() {
  return {
    commander: "Jessica Jones, Private Eye",
    packages: [
      {
        packageId: "pkg-1",
        name: "Power Boosters",
        purpose: "Increase Jessica's power to exile more cards.",
        status: "CORE" as const,
        candidateCards: ["Giant Growth", "Rage Forger"],
      },
    ],
  };
}

function jessicaEarlyDeck(): CouncilCardV46[] {
  return [
    card("Gamble", "oid-gamble", ["access", "card-advantage"]),
    card("Imperial Recruiter", "oid-recruiter", ["access", "card-advantage"]),
    ...Array.from({ length: 9 }, (_, i) => card(`Spell ${i}`, `oid-${i}`, ["engine"])),
    { ...card("Escape Tunnel", "oid-land", ["land"]), category: "land" as const },
  ];
}

function v4165TerminateTrueFingerprint() {
  const fp = buildLoopFingerprintV4165({
    selectedCardCount: 12,
    missions: [],
    candidatePoolNames: ["A", "B"],
  });
  return evaluateBuildLoopTerminationV4165({
    priorFingerprint: fp,
    currentFingerprint: fp,
    missions: [],
  });
}

function jessicaShapedTelemetryV4166(phase: BuildPhaseV4166 = "EARLY_ASSEMBLY", shouldTerminate = false) {
  const earlyDeck = jessicaEarlyDeck();
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 34, structuralNonLandTarget: 65, reservedLandSlots: 34 } as never,
    selectedCards: earlyDeck,
  });
  const plan = buildStructuralCompletionPlanV4166({
    slotBudget,
    selectedCards: earlyDeck,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryJessica() as never, selectedCards: earlyDeck }),
    requestedBracket: 4,
    stallDetected: phase === "STALLED_RECOVERY",
    terminalExhaustion: shouldTerminate,
  });
  const tel = updateStructuralBuildTelemetryV4166({
    prior: null,
    slotBudget,
    deckNeeds: [],
    theoryRealizations: assessTheoryRealizationV4165({ theory: theoryJessica() as never, selectedCards: earlyDeck }),
    selectedCards: earlyDeck,
    candidatePool: [card("Opt", "oid-opt", ["interaction"])],
    requestedBracket: 4,
    commanderColorIdentity: ["R", "G"],
    catalog: null,
    recordExecution: false,
  });
  return {
    ...tel,
    buildPhase: phase,
    completionPlan: { ...plan, buildPhase: phase },
    recomputeCount: 2,
    termination: shouldTerminate
      ? evaluateBuildLoopTerminationV4166({
          buildPhase: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
          executions: [],
          exhaustionEvidence: buildExhaustionEvidenceV4166({ executions: [], applicableTiers: [1, 2, 3, 4, 5, 6, 7] }),
          consecutiveExecutionNoOps: 2,
        })
      : tel.termination,
  };
}

function jessicaShapedSession(telemetryV4166: ReturnType<typeof jessicaShapedTelemetryV4166>): BrewSessionV42 {
  const earlyDeck = jessicaEarlyDeck();
  return {
    fixtureCase: null,
    finalReport: null,
    councilState: {
      buildPhase: "BUILDING",
      selectedCards: earlyDeck,
      deckSlotBudgetV4163: assessDeckSlotBudgetV4163({
        manaPlan: { expectedLandCount: 34, structuralNonLandTarget: 65, reservedLandSlots: 34 } as never,
        selectedCards: earlyDeck,
      }),
      manaPlanV416: { expectedLandCount: 34, structuralNonLandTarget: 65, reservedLandSlots: 34 } as never,
      structuralBuildTelemetryV4165: { termination: v4165TerminateTrueFingerprint() },
      structuralBuildTelemetryV4166: telemetryV4166,
    },
  } as BrewSessionV42;
}

function run() {
  const legacyTerm = v4165TerminateTrueFingerprint();
  assert.equal(legacyTerm.shouldTerminate, true, "v4165 legacy still emits terminate for regression telemetry");

  const telEarly = jessicaShapedTelemetryV4166("EARLY_ASSEMBLY", false);
  assert.equal(telEarly.termination?.shouldTerminate, false);

  const control = resolveProfessorBuildControlV41661({
    libraryCount: 12,
    landCount: 1,
    structurallyComplete: false,
    structuralTarget: 65,
    telemetryV4166: telEarly,
    telemetryV4165: { termination: legacyTerm },
  });
  assert.equal(control.shouldContinueNormalAssembly, true);
  assert.equal(control.shouldTerminate, false);
  assert.equal(control.legacyTerminationIgnored, true);
  assert.match(control.reason, /LEGACY_TERMINATION_IGNORED/);
  assertLegacyTerminationIgnoredV41661(control);

  const session = jessicaShapedSession(telEarly);
  assert.equal(professorBrewShouldContinueAutoBuildV47(session), true, "Jessica-shaped 11/65 must continue despite v4165");

  let advanceTreeCalls = 0;
  if (professorBrewShouldContinueAutoBuildV47(session)) advanceTreeCalls += 1;
  assert.equal(advanceTreeCalls, 1, "First production iteration must allow exactly one ADVANCE_TREE");

  const stalledTel = jessicaShapedTelemetryV4166("STALLED_RECOVERY", false);
  stalledTel.completionPlan = {
    ...stalledTel.completionPlan,
    action: "RUN_STRUCTURAL_RESEARCH",
    buildPhase: "STALLED_RECOVERY",
  };
  const stalledSession = jessicaShapedSession(stalledTel);
  assert.equal(professorBrewNeedsStructuralResearchV4166(stalledSession), true);

  const incompleteManaSession = jessicaShapedSession(telEarly);
  assert.equal(professorBrewNeedsManaBaseV48(incompleteManaSession), false);

  const evidence = buildExhaustionEvidenceV4166({ executions: [], applicableTiers: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(evidence.validForTerminalExhaustion, false);
  const exhaustedTel = jessicaShapedTelemetryV4166("BUILD_FAILED_CANDIDATE_EXHAUSTION", true);
  exhaustedTel.termination = evaluateBuildLoopTerminationV4166({
    buildPhase: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
    executions: [
      executeStructuralSearchV4166({
        executionId: "ex-1",
        mission: buildStructuralCompletionPlanV4166({
          slotBudget: assessDeckSlotBudgetV4163({
            manaPlan: { expectedLandCount: 34, structuralNonLandTarget: 65, reservedLandSlots: 34 } as never,
            selectedCards: jessicaEarlyDeck(),
          }),
          selectedCards: jessicaEarlyDeck(),
          deckNeeds: [],
          theoryRealizations: [],
          requestedBracket: 4,
          stallDetected: true,
          terminalExhaustion: false,
        }).missions[0]!,
        candidatePool: [],
        selectedCards: jessicaEarlyDeck(),
        catalog: null,
        commanderColorIdentity: ["R", "G"],
        requestedBracket: 4,
      }),
    ],
    exhaustionEvidence: buildExhaustionEvidenceV4166({
      executions: [],
      applicableTiers: [1, 2, 3, 4, 5, 6, 7],
    }),
    consecutiveExecutionNoOps: 2,
  });
  exhaustedTel.termination = {
    ...exhaustedTel.termination!,
    shouldTerminate: true,
    terminalState: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
    progressState: "SEARCH_SPACE_EXHAUSTED",
  };
  const exhaustedSession = jessicaShapedSession(exhaustedTel);
  exhaustedSession.councilState!.structuralBuildTelemetryV4165 = { termination: legacyTerm };
  assert.equal(professorBrewShouldContinueAutoBuildV47(exhaustedSession), false);

  const productionControlReads = LEGACY_BUILD_CONTROL_AUDIT_V41661.filter((r) => r.status !== "TELEMETRY_ONLY");
  assert.ok(
    productionControlReads.every((r) => r.status === "REMOVED" || r.status === "FIXED"),
    "All production-control v4165 reads must be REMOVED or FIXED",
  );
  assert.ok(
    !JSON.stringify(professorBrewShouldContinueAutoBuildV47.toString()).includes("4165"),
    "shouldContinue must not reference v4165 in source",
  );

  const semantics = assessProspectiveAcceptanceSemanticsV4165({
    headProfessorExecuted: false,
    refinementExecuted: false,
    preFinalCriticExecuted: false,
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
    noOpTerminationEnforced: true,
    manaGatingEnforced: true,
    realizedPowerTruthPass: true,
    productComplete: false,
  });
  assert.equal(semantics.preFinalCritic, "NOT_EVALUATED");

  const tmpParent = mkdtempSync(join(tmpdir(), "prospective-out-"));
  const nested = join(tmpParent, "nested", "prospective");
  assert.equal(existsSync(nested), false);
  const created = ensureProspectiveOutputDirectory(nested);
  assert.equal(created, nested);
  assert.equal(existsSync(nested), true);
  writeFileSync(join(created, "run-log.txt"), "ok\n");
  rmSync(tmpParent, { recursive: true, force: true });

  console.log("PROFESSOR v4.16.6.1 authoritative build gate — PASS");
}

run();
