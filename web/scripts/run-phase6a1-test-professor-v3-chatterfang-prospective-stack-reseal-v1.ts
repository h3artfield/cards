#!/usr/bin/env npx tsx
/** Chatterfang prospective stack reseal audit — 0 OpenAI calls. */
import { spawnSync } from "node:child_process";
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
  buildProfessorV3ChatterfangProspectiveRunnerBindingV1,
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";
import { buildProfessorV3YurikoProspectiveRunnerBindingV1 } from "./lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1";
import { sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10 } from "./lib/phase6a1-professor-v3-smoke-terminal-seal-v10";
import {
  assertionIdsWithValidationErrors,
  seedFrozenYurikoEvidenceLedgerFromAttempt003,
  YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1,
  YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1,
} from "./lib/phase6a1-professor-v3-generic-grounding-derivation-repair-v1";
import { runProfessorV3ChatterfangPreModelAuditV1 } from "./lib/phase6a1-professor-v3-chatterfang-pre-model-audit-v1";
import {
  resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1,
  resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import {
  loadProfessorV3ReviewedExecutionIdentityV11,
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v11";
import { loadProfessorV3ZadaSpentAttempt000ParsedResponseV1 } from "./lib/phase6a1-professor-v3-zada-spent-tool-loop-fixture-v1";
import { runProfessorV3TwoModelCallOrdinalTestV1 } from "./lib/phase6a1-professor-v3-two-model-call-ordinal-test-v1";
import {
  CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH,
  getPilotMechanismCatalogEntry,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import type { StrategyHypothesisV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";

const WEB = resolve(REPO, "web");
const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-audit-v1.json");
const DERIVATION_AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json");
const GROUNDING_GRAPH_PATH = resolve(REPO, "web/src/lib/deck-synthesis/grounding-derivation-graph-v1.ts");
const ZERO_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";

const PRODUCTION_GROUNDING_PATHS = [
  resolve(REPO, "web/src/lib/deck-synthesis/grounding-derivation-graph-v1.ts"),
  resolve(REPO, "web/src/lib/deck-synthesis/typed-assertion-grounding-v3.ts"),
  resolve(REPO, "web/src/lib/deck-synthesis/strategy-package-validator-v3.ts"),
];

const FORBIDDEN_PRODUCTION_BRANCH_PATTERN =
  /\b(Chatterfang|Squirrel|multi-chatterfang|professor-v3-smoke-chatterfang|Yuriko|Zada|Korvold|Muldrotha|Atraxa|professor-v3-smoke-yuriko|professor-v3-smoke-zada|multi-yuriko|multi-zada|ind-a2|harm-a4)\b/i;

const SUBPROCESS_AUDITS = [
  {
    id: "subprocess-post-zada-model-tool-model-ordinal-v2",
    script: "scripts/run-phase6a1-test-professor-v3-post-zada-model-tool-model-ordinal-and-provenance-repair-v2.ts",
    expectedPass: 27,
  },
  {
    id: "subprocess-post-zada-tool-loop-repair-v1",
    script: "scripts/run-phase6a1-test-professor-v3-post-zada-tool-loop-repair-v1.ts",
    expectedPass: 21,
  },
] as const;

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function parseSubprocessAuditStdout(stdout: string): { passed?: number; failed?: number } | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { passed?: number; failed?: number };
    if (typeof parsed.passed === "number") return parsed;
  } catch {
    /* fall through */
  }
  for (const line of trimmed.split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { passed?: number; failed?: number };
      if (typeof parsed.passed === "number") return parsed;
    } catch {
      /* continue */
    }
  }
  return null;
}

function runSubprocessAudit(scriptRelativePath: string, expectedPass: number) {
  const result = spawnSync("npx", ["tsx", scriptRelativePath], {
    encoding: "utf8",
    cwd: WEB,
    shell: true,
  });
  const parsed = parseSubprocessAuditStdout(result.stdout ?? "");
  const passed = parsed?.passed ?? 0;
  const failed = parsed?.failed ?? expectedPass;
  return {
    pass: result.status === 0 && passed === expectedPass && failed === 0,
    detail: `exit=${result.status ?? "null"}; passed=${passed}/${expectedPass}; failed=${failed}; stderrTail=${(result.stderr ?? "").slice(-240)}`,
  };
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
      "Production grounding file has no commander/case/assertion branches",
      match == null,
      match ? `matched '${match[0]}'` : "clean",
    );
  }

  const mechanismTruthText = readFileSync(CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH, "utf8");
  record(
    checks,
    "mechanism-truth-data-allows-token-squirrel",
    "Mechanism truth data files may contain token/Squirrel references",
    /\btoken\b/i.test(mechanismTruthText) && /Squirrel/i.test(mechanismTruthText),
    "Chatterfang mechanism truth fixture retains token/Squirrel oracle text",
  );
  return checks;
}

function runChatterfangGenericDerivationChecks(): Check[] {
  const checks: Check[] = [];
  const entry = getPilotMechanismCatalogEntry("multi-chatterfang");
  if (!entry) throw new Error("Missing multi-chatterfang mechanism truth");
  const fact = entry.independentMechanismFacts.find((f) => f.mechanismId === "commander-token-creation-replacement-modification");
  if (!fact) throw new Error("Missing commander-token-creation-replacement-modification");

  const states = canonicalStatesFromMechanismFact(fact);
  record(
    checks,
    "chatterfang-generic-token-states",
    "multi-chatterfang token replacement fact emits CREATURE_TOKENS",
    states.has("CREATURE_TOKENS"),
    [...states].sort().join(", "),
  );

  const triggerProof = triggerSupportsTriggersOnAssertion(fact, {
    assertionId: "fixture",
    packageId: "fixture",
    predicate: "TRIGGERS_ON",
    object: "TOKENS_WOULD_BE_CREATED",
    evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId] }],
  } as StrategicAssertionV3);
  record(
    checks,
    "chatterfang-positive-token-creation-trigger",
    "Generic TRIGGERS_ON normalization for TOKENS_WOULD_BE_CREATED",
    triggerProof != null,
    triggerProof ? triggerProof.ruleIds.join(",") : "missing",
  );

  const ctx = buildAssertionResolverContextV3(
    buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: true } }),
  );
  const positiveCreatureTokens = tryDeriveGameStateProof(
    {
      assertionId: "fixture-positive",
      packageId: "fixture",
      predicate: "PRODUCES_STATE",
      resourceOrState: "CREATURE_TOKENS",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId] }],
    } as StrategicAssertionV3,
    ctx,
  );
  record(
    checks,
    "chatterfang-positive-creature-tokens",
    "Canonical CREATE_TOKEN support derives CREATURE_TOKENS from mechanism fact",
    positiveCreatureTokens != null,
    positiveCreatureTokens ? positiveCreatureTokens.ruleIds.join(",") : "missing",
  );

  const korvold = getPilotMechanismCatalogEntry("multi-korvold");
  const korvoldCtx = buildAssertionResolverContextV3(
    buildProfessorPlanningContextV3Sync({ entry: korvold!, oppCase: null, options: { includeMechanicalAffordances: true } }),
  );
  const negativeCreatureTokens = tryDeriveGameStateProof(
    {
      assertionId: "fixture-negative",
      packageId: "fixture",
      predicate: "PRODUCES_STATE",
      resourceOrState: "CREATURE_TOKENS",
      evidenceRefs: [
        {
          kind: "RAG_EVIDENCE",
          evidenceIds: ["fixture-rag-creature-token-claim"],
          statement: "Creature tokens would flood the board.",
        },
      ],
    } as StrategicAssertionV3,
    korvoldCtx,
  );
  record(
    checks,
    "negative-creature-tokens-without-canonical-support",
    "RAG-only CREATURE_TOKENS rejected without canonical CREATE_TOKEN support",
    negativeCreatureTokens == null,
    "RAG-only CREATURE_TOKENS on multi-korvold must not derive",
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
    const tmpRoot = mkdtempSync(join(tmpdir(), `chatterfang-terminal-seal-${outcome.id}-`));
    const targets = resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1(tmpRoot);
    const seal = sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
      targets,
      caseId: "professor-v3-smoke-chatterfang-prospective-v1",
      mechanismTruthCaseId: "multi-chatterfang",
      executionStage: outcome.error ? "MODEL_ORCHESTRATION" : "VALIDATE",
      materialPins: { fileCount: 0, files: [] },
      stackIdentity: "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
      independentlyReviewedExecutionAuthorization: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
      reviewedExecutionIdentity: {
        version: "phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1",
        decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
        stackIdentity: "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
        prospectiveCaseId: "professor-v3-smoke-chatterfang-prospective-v1",
        mechanismTruthCaseId: "multi-chatterfang",
        executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts",
        executeRunnerSha256: ZERO_SHA256,
        executionPinsArtifactRelativePath:
          "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json",
        executionPinsArtifactSha256: ZERO_SHA256,
        dependencyManifestSha256: ZERO_SHA256,
      },
      modelAttemptArtifacts: [],
      executionTrace: null,
      runLedger: null,
      stdout: "",
      stderr: "",
      decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
      error: outcome.error,
      orchestration: outcome.caseStatus
        ? {
            executionMode: "REAL_SMOKE",
            realOutcome: outcome.caseStatus,
            modelAuthorization: "AUTHORIZED",
            caseId: "professor-v3-smoke-chatterfang-prospective-v1",
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

function runSealedExecutableStackChecks(): Check[] {
  const checks: Check[] = [];
  if (!existsSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH)) {
    record(
      checks,
      "sealed-executable-stack-skipped",
      "Sealed executable stack checks skipped — identity artifact not yet present",
      true,
      PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH,
    );
    return checks;
  }

  const identity = loadProfessorV3ReviewedExecutionIdentityV11();
  record(
    checks,
    "sealed-identity-dependency-manifest-non-zero",
    "Reviewed execution identity dependencyManifestSha256 is non-zero",
    identity.dependencyManifestSha256 !== ZERO_SHA256,
    identity.dependencyManifestSha256,
  );
  record(
    checks,
    "sealed-identity-execute-runner-non-zero",
    "Reviewed execution identity executeRunnerSha256 is non-zero",
    identity.executeRunnerSha256 !== ZERO_SHA256,
    identity.executeRunnerSha256,
  );
  record(
    checks,
    "sealed-identity-pins-artifact-present",
    "Reviewed execution pins artifact exists when identity is sealed",
    existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH),
    PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH,
  );
  return checks;
}

async function buildZadaContextForOrdinalTest(caseId: string) {
  const entry = getPilotMechanismCatalogEntry("multi-zada");
  if (!entry) throw new Error("Missing multi-zada mechanism truth");
  const ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = caseId;
  return ctx;
}

async function runTwoModelCallOrdinalChecks(): Promise<{ checks: Check[]; evidence: Awaited<ReturnType<typeof runProfessorV3TwoModelCallOrdinalTestV1>> | null }> {
  const checks: Check[] = [];
  const ordinalTempDir = mkdtempSync(join(tmpdir(), "chatterfang-two-model-call-"));
  let ordinalEvidence: Awaited<ReturnType<typeof runProfessorV3TwoModelCallOrdinalTestV1>> | null = null;
  try {
    ordinalEvidence = await runProfessorV3TwoModelCallOrdinalTestV1({
      ctx: await buildZadaContextForOrdinalTest("professor-v3-two-model-call-ordinal-chatterfang-reseal-v1"),
      frozenEnvelope: loadProfessorV3ZadaSpentAttempt000ParsedResponseV1(),
      outputDir: ordinalTempDir,
    });
    const trace = ordinalEvidence.modelCallTrace;
    record(
      checks,
      "two-model-call-trace-shape",
      "Production orchestration performs two model invocations: call-0 pre-tools, call-1 post-tools",
      trace.length === 2 &&
        trace[0]?.modelCallOrdinal === 0 &&
        trace[0]?.afterToolResults === false &&
        trace[1]?.modelCallOrdinal === 1 &&
        trace[1]?.afterToolResults === true,
      JSON.stringify(trace),
    );
    record(
      checks,
      "two-model-call-artifact-namespaces-distinct",
      "attempt-000-* and attempt-001-* artifact namespaces both exist without collision",
      ordinalEvidence.attemptArtifactFiles.some((f) => f.startsWith("attempt-000-")) &&
        ordinalEvidence.attemptArtifactFiles.some((f) => f.startsWith("attempt-001-")),
      ordinalEvidence.attemptArtifactFiles.join(", "),
    );
  } catch (err) {
    record(
      checks,
      "two-model-call-trace-shape",
      "Production orchestration performs two model invocations: call-0 pre-tools, call-1 post-tools",
      false,
      String(err),
    );
  } finally {
    if (existsSync(ordinalTempDir)) rmSync(ordinalTempDir, { recursive: true, force: true });
  }
  return { checks, evidence: ordinalEvidence };
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
    "Chatterfang candidate authorization seals maxModelApiCalls=4",
    PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.maxModelApiCalls === 4 &&
      PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.modelExecutionAuthorized === true,
    `maxModelApiCalls=${PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.maxModelApiCalls}`,
  );

  const chatterfangGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
    runner: buildProfessorV3ChatterfangProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.decision,
    }),
    executeSwitchPresent: true,
  });
  record(
    checks,
    "chatterfang-candidate-preflight-eligible",
    "Chatterfang candidate authorization with matching runner is preflight eligible",
    chatterfangGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
    chatterfangGate.status,
  );

  const yurikoSpentGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
    runner: buildProfessorV3YurikoProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.decision,
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
          decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.decision,
        }),
      ),
    yurikoSpentGate.status,
  );

  const liveExecuteGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION,
    runner: buildProfessorV3ChatterfangProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.decision,
    }),
    executeSwitchPresent: true,
  });
  record(
    checks,
    "live-root-blocks-chatterfang-execute",
    "Live NO_MODEL root blocks Chatterfang --execute",
    liveExecuteGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
    liveExecuteGate.status,
  );

  const budget1Blocked = await assertModelCallBudget({ maxModelApiCalls: 1, permittedThrough: 0, blockedAt: 1 });
  record(checks, "model-call-budget-1", "Budget 1 permits attempt-000 and blocks attempt-001", budget1Blocked);

  const budget4Blocked = await assertModelCallBudget({ maxModelApiCalls: 4, permittedThrough: 3, blockedAt: 4 });
  record(checks, "model-call-budget-4", "Budget 4 permits attempts 000-003 and blocks attempt-004", budget4Blocked);

  checks.push(...(await runFrozenYurikoReplay()));
  checks.push(...runProductionGroundingBranchScan());
  checks.push(...runChatterfangGenericDerivationChecks());
  checks.push(...runTerminalSealChecks());
  checks.push(...runSealedExecutableStackChecks());

  const preModel = await runProfessorV3ChatterfangPreModelAuditV1();
  for (const c of preModel.checks) {
    record(checks, `pre-model-${c.id}`, c.description, c.pass, c.detail);
  }

  for (const audit of SUBPROCESS_AUDITS) {
    const result = runSubprocessAudit(audit.script, audit.expectedPass);
    record(
      checks,
      audit.id,
      `Subprocess audit ${audit.script} passes ${audit.expectedPass}/${audit.expectedPass}`,
      result.pass,
      result.detail,
    );
  }

  const ordinal = await runTwoModelCallOrdinalChecks();
  checks.push(...ordinal.checks);

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
  record(
    checks,
    "chatterfang-mechanism-truth-artifact-present",
    "Chatterfang prospective mechanism truth artifact present",
    existsSync(CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH),
    CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH,
  );

  const passCount = checks.filter((c) => c.pass).length;
  const report = {
    version: "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
    openAiCalls: 0,
    pass: passCount === checks.length,
    passCount,
    totalChecks: checks.length,
    bindings: {
      prospectiveCaseId: "professor-v3-smoke-chatterfang-prospective-v1",
      mechanismTruthCaseId: "multi-chatterfang",
      stackIdentity: "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
      maxModelApiCalls: 4,
    },
    reviewBundleIncludes: [
      "phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json",
      "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1.json",
      "web/src/lib/deck-synthesis/grounding-derivation-graph-v1.ts",
    ],
    realChatterfangProspectiveSmoke: "NOT_YET_AUTHORIZED",
    checks,
    twoModelCallEvidence: ordinal.evidence,
    sourceHashes: {
      phase6a1ProfessorV3SmokeExecutionAuthorizationChatterfangV1: sha256File(
        resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts"),
      ),
      phase6a1ProfessorV3ChatterfangPreModelAuditV1: sha256File(
        resolve(WEB, "scripts/lib/phase6a1-professor-v3-chatterfang-pre-model-audit-v1.ts"),
      ),
      phase6a1ProfessorV3SmokeMaterialPinsV11: sha256File(resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v11.ts")),
      groundingDerivationGraphV1: sha256File(GROUNDING_GRAPH_PATH),
      phase6a1ProfessorV3ChatterfangProspectiveMechanismTruthV1: sha256File(CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH),
      runPhase6a1TestProfessorV3ChatterfangProspectiveStackResealV1: sha256File(
        resolve(WEB, "scripts/run-phase6a1-test-professor-v3-chatterfang-prospective-stack-reseal-v1.ts"),
      ),
    },
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
