#!/usr/bin/env npx tsx
/** Zada prospective stack reseal audit — 0 OpenAI calls. */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import {
  canonicalStatesFromMechanismFact,
  triggerSupportsTriggersOnAssertion,
  tryDeriveGameStateProof,
} from "../src/lib/deck-synthesis/grounding-derivation-graph-v1";
import { buildAssertionResolverContextV3 } from "../src/lib/deck-synthesis/typed-assertion-grounding-v3";
import type { StrategicAssertionV3 } from "../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import {
  buildValidatorContextV3FromPlanning,
  resetValidatorIssueCounterV3,
  validateProfessorPlanOutputV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import {
  createProfessorV3ModelCallBudgetGuardV1,
  PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1,
  ProfessorV3ModelCallBudgetExhaustedErrorV1,
  wrapProfessorV3ModelCallerWithBudgetV1,
} from "./lib/phase6a1-professor-v3-model-call-budget-v1";
import { buildProfessorPlanningContextV3, buildProfessorPlanningContextV3Sync } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import {
  evaluateProfessorV3SmokeExecutionGateV1,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
  isProfessorV3SpentYurikoProspectiveRunnerBindingV1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import {
  buildProfessorV3ZadaProspectiveRunnerBindingV1,
  PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
  PROFESSOR_V3_ZADA_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-zada-v1";
import { buildProfessorV3YurikoProspectiveRunnerBindingV1 } from "./lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1";
import { sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10 } from "./lib/phase6a1-professor-v3-smoke-terminal-seal-v10";
import {
  assertionIdsWithValidationErrors,
  seedFrozenYurikoEvidenceLedgerFromAttempt003,
  YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1,
  YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1,
} from "./lib/phase6a1-professor-v3-generic-grounding-derivation-repair-v1";
import { runProfessorV3ZadaPreModelAuditV1 } from "./lib/phase6a1-professor-v3-zada-pre-model-audit-v1";
import { resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1, resolveProfessorV3SmokeZadaProspectiveOutputTargetsV1 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, REPO } from "./lib/phase6a1-pinned-implementation-container-v1";
import type { StrategyHypothesisV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-zada-prospective-stack-reseal-audit-v1.json");
const DERIVATION_AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json");
const GROUNDING_GRAPH_PATH = resolve(REPO, "web/src/lib/deck-synthesis/grounding-derivation-graph-v1.ts");

const PRODUCTION_GROUNDING_PATHS = [
  resolve(REPO, "web/src/lib/deck-synthesis/grounding-derivation-graph-v1.ts"),
  resolve(REPO, "web/src/lib/deck-synthesis/typed-assertion-grounding-v3.ts"),
  resolve(REPO, "web/src/lib/deck-synthesis/strategy-package-validator-v3.ts"),
];

const FORBIDDEN_PRODUCTION_BRANCH_PATTERN =
  /\b(Yuriko|Zada|Korvold|Muldrotha|Atraxa|professor-v3-smoke-yuriko|professor-v3-smoke-zada|multi-yuriko|multi-zada|ind-a2|harm-a4)\b/i;

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

async function assertModelCallBudget(args: { maxModelApiCalls: number; permittedThrough: number; blockedAt: number }) {
  const guard = createProfessorV3ModelCallBudgetGuardV1(args.maxModelApiCalls);
  const wrapped = wrapProfessorV3ModelCallerWithBudgetV1({
    budgetGuard: guard,
    modelCaller: async () => ({ parsed: {} }),
  });
  for (let i = 0; i <= args.permittedThrough; i++) {
    await wrapped({
      attemptIndex: i,
      systemPrompt: "s",
      userPayload: { modelVisibleText: "u", evidenceLedgerEntries: [], stableEvidenceIdIndex: [] },
    });
  }
  let blocked = false;
  try {
    await wrapped({
      attemptIndex: args.blockedAt,
      systemPrompt: "s",
      userPayload: { modelVisibleText: "u", evidenceLedgerEntries: [], stableEvidenceIdIndex: [] },
    });
  } catch (error) {
    blocked = error instanceof Error && error.message.includes(PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1);
  }
  return blocked;
}

async function runFrozenYurikoReplay(): Promise<Check[]> {
  const checks: Check[] = [];
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1();
  const parsedEnvelope = JSON.parse(
    readFileSync(join(targets.modelAttemptsDir, "attempt-003-parsed-response.json"), "utf8"),
  ) as { parsed?: unknown };

  const entry = getPilotMechanismCatalogEntry("multi-yuriko");
  if (!entry) throw new Error("Missing multi-yuriko mechanism truth");
  let ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = "professor-v3-smoke-yuriko-prospective-v1";

  const normalization = normalizeProfessorPlanningResponseV3({
    parsedModelResponse: parsedEnvelope.parsed ?? parsedEnvelope,
    ctx,
  });
  const hypotheses = normalization.normalized as StrategyHypothesisV3[];
  ctx = seedFrozenYurikoEvidenceLedgerFromAttempt003({ ctx, hypotheses });

  resetValidatorIssueCounterV3();
  const validationOutcomes = validateProfessorPlanOutputV3(buildValidatorContextV3FromPlanning(ctx), {
    strategyHypotheses: hypotheses,
  });
  const failingAssertionIds = assertionIdsWithValidationErrors(
    validationOutcomes.flatMap((o) => o.issues.filter((i) => i.severity === "ERROR").map((i) => i.message)),
  );
  const stillFailing = YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1.filter((id) => failingAssertionIds.has(id));
  const repaired = YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1.filter((id) => !failingAssertionIds.has(id));

  record(
    checks,
    "frozen-yuriko-replay-11-of-13",
    "Frozen Yuriko replay repairs 11/13 assertions",
    repaired.length === 11 && stillFailing.length === 2,
    `repaired=${repaired.length}; still failing=${stillFailing.join(", ")}`,
  );
  record(
    checks,
    "frozen-yuriko-anti-cheat-held",
    "Only ind-a2 and harm-a4 remain rejected",
    stillFailing.every((id) => (YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1 as readonly string[]).includes(id)),
    stillFailing.join(", "),
  );
  return checks;
}

function runProductionGroundingBranchScan(): Check[] {
  const checks: Check[] = [];
  for (const path of PRODUCTION_GROUNDING_PATHS) {
    const text = readFileSync(path, "utf8");
    const match = text.match(FORBIDDEN_PRODUCTION_BRANCH_PATTERN);
    record(
      checks,
      `no-commander-branches-${path.split(/[/\\]/).pop()}`,
      `Production grounding file has no commander/case/assertion branches`,
      match == null,
      match ? `matched '${match[0]}'` : "clean",
    );
  }
  return checks;
}

function runZadaGenericDerivationChecks(): Check[] {
  const checks: Check[] = [];
  const entry = getPilotMechanismCatalogEntry("multi-zada");
  if (!entry) throw new Error("Missing multi-zada mechanism truth");
  const fact = entry.independentMechanismFacts.find((f) => f.mechanismId === "commander-targeted-spell-copy-trigger");
  if (!fact) throw new Error("Missing commander-targeted-spell-copy-trigger");

  const states = canonicalStatesFromMechanismFact(fact);
  record(
    checks,
    "zada-generic-copy-states",
    "multi-zada COPY_SPELL emits generic spell-copy derived states",
    states.has("SPELL_COPIES") && states.has("MULTIPLE_SPELL_RESOLUTIONS"),
    [...states].sort().join(", "),
  );

  const triggerProof = triggerSupportsTriggersOnAssertion(fact, {
    assertionId: "fixture",
    packageId: "fixture",
    predicate: "TRIGGERS_ON",
    object: "YOU_CAST_INSTANT_OR_SORCERY_TARGETS_ONLY_COMMANDER",
    evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId] }],
  } as StrategicAssertionV3);
  record(
    checks,
    "zada-positive-targeting-copy-trigger",
    "Generic TRIGGERS_ON normalization for commander-targeted spell cast",
    triggerProof != null,
    triggerProof ? triggerProof.ruleIds.join(",") : "missing",
  );

  const ctx = buildAssertionResolverContextV3(
    buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: true } }),
  );
  const positiveCopy = tryDeriveGameStateProof(
    {
      assertionId: "fixture-positive",
      packageId: "fixture",
      predicate: "PRODUCES_STATE",
      resourceOrState: "MULTIPLE_SPELL_RESOLUTIONS",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId] }],
    } as StrategicAssertionV3,
    ctx,
  );
  record(
    checks,
    "zada-positive-multiple-spell-resolutions",
    "Canonical COPY_SPELL support derives MULTIPLE_SPELL_RESOLUTIONS",
    positiveCopy != null,
    positiveCopy ? positiveCopy.ruleIds.join(",") : "missing",
  );

  const korvold = getPilotMechanismCatalogEntry("multi-korvold");
  const korvoldCtx = buildAssertionResolverContextV3(
    buildProfessorPlanningContextV3Sync({ entry: korvold!, oppCase: null, options: { includeMechanicalAffordances: true } }),
  );
  const negativeCopy = tryDeriveGameStateProof(
    {
      assertionId: "fixture-negative",
      packageId: "fixture",
      predicate: "PRODUCES_STATE",
      resourceOrState: "MULTIPLE_SPELL_RESOLUTIONS",
      evidenceRefs: [
        {
          kind: "RAG_EVIDENCE",
          evidenceIds: ["fixture-rag-copy-claim"],
          statement: "Multiple spell copies would finish the table.",
        },
      ],
    } as StrategicAssertionV3,
    korvoldCtx,
  );
  record(
    checks,
    "negative-copy-without-canonical-support",
    "Copy-related derived state rejected without canonical COPY_SPELL support",
    negativeCopy == null,
    "RAG-only MULTIPLE_SPELL_RESOLUTIONS on non-copy commander facts must not derive",
  );
  return checks;
}

function runTerminalSealChecks(): Check[] {
  const checks: Check[] = [];
  const outcomes: Array<{
    id: string;
    caseStatus?: "SUCCESS" | "REPAIR_EXHAUSTED";
    error?: unknown;
  }> = [
    { id: "SUCCESS", caseStatus: "SUCCESS" },
    { id: "REPAIR_EXHAUSTED", caseStatus: "REPAIR_EXHAUSTED" },
    {
      id: "MODEL_CALL_BUDGET_EXHAUSTED",
      error: new ProfessorV3ModelCallBudgetExhaustedErrorV1({ maxModelApiCalls: 4, attemptedCallIndex: 4 }),
    },
    { id: "FAILED_EXCEPTION", error: new Error("synthetic terminal exception") },
  ];

  for (const outcome of outcomes) {
    const tmpRoot = mkdtempSync(join(tmpdir(), `zada-terminal-seal-${outcome.id}-`));
    const targets = resolveProfessorV3SmokeZadaProspectiveOutputTargetsV1(tmpRoot);
    const seal = sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
      targets,
      caseId: "professor-v3-smoke-zada-prospective-v1",
      mechanismTruthCaseId: "multi-zada",
      executionStage: outcome.error ? "MODEL_ORCHESTRATION" : "VALIDATE",
      materialPins: { fileCount: 0, files: [] },
      stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
      independentlyReviewedExecutionAuthorization: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
      reviewedExecutionIdentity: {
        version: "phase6a1-professor-v3-smoke-execution-identity-v10-zada-executable-v1",
        decision: PROFESSOR_V3_ZADA_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
        stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
        prospectiveCaseId: "professor-v3-smoke-zada-prospective-v1",
        mechanismTruthCaseId: "multi-zada",
        executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-zada-prospective-v1.ts",
        executeRunnerSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        executionPinsArtifactRelativePath:
          "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v10-zada-executable-v1.json",
        executionPinsArtifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        dependencyManifestSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      },
      modelAttemptArtifacts: [],
      executionTrace: null,
      runLedger: null,
      stdout: "",
      stderr: "",
      decision: PROFESSOR_V3_ZADA_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
      error: outcome.error,
      orchestration: outcome.caseStatus
        ? {
            executionMode: "REAL_SMOKE",
            realOutcome: outcome.caseStatus,
            modelAuthorization: "AUTHORIZED",
            caseId: "professor-v3-smoke-zada-prospective-v1",
            caseStatus: outcome.caseStatus,
            executionStatus: outcome.caseStatus,
            phasesExecuted: ["VALIDATE"],
            runLedger: null,
            executionTrace: null,
            toolCalls: [],
            repairRounds: [],
            maxRepairRounds: 3,
            normalization: null,
            validationOutcomes: [],
            lensCoverageIssues: [],
            promptPayload: null,
          }
        : null,
    });
    record(
      checks,
      `terminal-seal-${outcome.id.toLowerCase()}`,
      `${outcome.id} produces canonical terminal sealing artifacts`,
      seal.terminalOutcome === outcome.id && existsSync(targets.manifest) && (existsSync(targets.result) || existsSync(targets.failure)),
      `terminalOutcome=${seal.terminalOutcome}`,
    );
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  return checks;
}

async function main() {
  loadProjectEnvLocal();
  const checks: Check[] = [];

  record(
    checks,
    "live-root-no-model",
    "Live authorization root remains NO_MODEL",
    PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized === false,
    `modelExecutionAuthorized=${PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized}`,
  );

  record(
    checks,
    "candidate-max-model-api-calls-4",
    "Zada candidate authorization seals maxModelApiCalls=4",
    PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.maxModelApiCalls === 4 &&
      PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.modelExecutionAuthorized === true,
    `maxModelApiCalls=${PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.maxModelApiCalls}`,
  );

  const zadaGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
    runner: buildProfessorV3ZadaProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.decision,
    }),
    executeSwitchPresent: true,
  });
  record(
    checks,
    "zada-candidate-preflight-eligible",
    "Zada candidate authorization with matching runner is preflight eligible",
    zadaGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
    zadaGate.status,
  );

  const yurikoSpentGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
    runner: buildProfessorV3YurikoProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.decision,
    }),
    executeSwitchPresent: true,
  });
  record(
    checks,
    "yuriko-spent-subject-still-blocked",
    "Spent Yuriko binding remains prohibited",
    yurikoSpentGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED ||
      isProfessorV3SpentYurikoProspectiveRunnerBindingV1(
        buildProfessorV3YurikoProspectiveRunnerBindingV1({
          decision: PROFESSOR_V3_ZADA_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.decision,
        }),
      ),
    yurikoSpentGate.status,
  );

  const liveExecuteGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION,
    runner: buildProfessorV3ZadaProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.decision,
    }),
    executeSwitchPresent: true,
  });
  record(
    checks,
    "live-root-blocks-zada-execute",
    "Live NO_MODEL root blocks Zada --execute",
    liveExecuteGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
    liveExecuteGate.status,
  );

  const budget1Blocked = await assertModelCallBudget({ maxModelApiCalls: 1, permittedThrough: 0, blockedAt: 1 });
  record(checks, "model-call-budget-1", "Budget 1 permits attempt-000 and blocks attempt-001", budget1Blocked);

  const budget4Blocked = await assertModelCallBudget({ maxModelApiCalls: 4, permittedThrough: 3, blockedAt: 4 });
  record(checks, "model-call-budget-4", "Budget 4 permits attempts 000-003 and blocks attempt-004", budget4Blocked);

  checks.push(...(await runFrozenYurikoReplay()));
  checks.push(...runProductionGroundingBranchScan());
  checks.push(...runZadaGenericDerivationChecks());
  checks.push(...runTerminalSealChecks());

  const preModel = await runProfessorV3ZadaPreModelAuditV1();
  for (const c of preModel.checks) {
    record(checks, `pre-model-${c.id}`, c.description, c.pass, c.detail);
  }

  record(
    checks,
    "derivation-audit-artifact-present",
    "Generic grounding derivation audit artifact present",
    existsSync(DERIVATION_AUDIT_PATH),
    DERIVATION_AUDIT_PATH,
  );
  record(
    checks,
    "grounding-graph-source-present",
    "grounding-derivation-graph-v1.ts present for review bundle",
    existsSync(GROUNDING_GRAPH_PATH),
    GROUNDING_GRAPH_PATH,
  );

  const passCount = checks.filter((c) => c.pass).length;
  const report = {
    version: "phase6a1-professor-v3-zada-prospective-stack-reseal-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_ZADA_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
    openAiCalls: 0,
    pass: passCount === checks.length,
    passCount,
    totalChecks: checks.length,
    bindings: {
      prospectiveCaseId: "professor-v3-smoke-zada-prospective-v1",
      mechanismTruthCaseId: "multi-zada",
      stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
      maxModelApiCalls: 4,
    },
    reviewBundleIncludes: [
      "phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json",
      "web/src/lib/deck-synthesis/grounding-derivation-graph-v1.ts",
    ],
    realZadaProspectiveSmoke: "NOT_YET_AUTHORIZED",
    checks,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
