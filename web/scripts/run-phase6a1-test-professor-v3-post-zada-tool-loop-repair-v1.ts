#!/usr/bin/env npx tsx
/** Post-Zada tool-loop execution repair audit — 0 OpenAI calls. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import {
  createProfessorV3ModelCallBudgetGuardV1,
  isProfessorV3ModelCallBudgetExhaustedErrorV1,
  PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1,
  wrapProfessorV3ModelCallerWithBudgetV1,
} from "./lib/phase6a1-professor-v3-model-call-budget-v1";
import {
  executeProfessorV3ToolCall,
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3OrchestrationProgressV3,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1 } from "./lib/phase6a1-professor-v3-zada-model-request-boundary-v1";
import { replayProfessorV3ZadaSpentToolLoopOfflineV1 } from "./lib/phase6a1-professor-v3-post-zada-tool-loop-replay-v1";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import { sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10 } from "./lib/phase6a1-professor-v3-smoke-terminal-seal-v10";
import {
  PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_ABSOLUTE_PATH,
  PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_SHA256,
  loadProfessorV3ZadaSpentAttempt000ParsedResponseV1,
} from "./lib/phase6a1-professor-v3-zada-spent-tool-loop-fixture-v1";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";

const OUT_PATH = join(
  MILESTONES,
  "phase6a1-professor-v3-post-zada-tool-loop-repair-audit-v1.json",
);

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function auditExecuteProfessorV3ToolCallSource(checks: Check[]) {
  const sourcePath = join(MILESTONES, "../../../scripts/lib/phase6a1-professor-plan-agent-v3.ts");
  const source = readFileSync(sourcePath, "utf8");
  const start = source.indexOf("export async function executeProfessorV3ToolCall");
  const end = source.indexOf("\nfunction buildNormalizationRepairPrompt", start);
  const fnBody = start >= 0 && end > start ? source.slice(start, end) : "";
  record(
    checks,
    "execute-tool-call-no-req-reference",
    "executeProfessorV3ToolCall() contains no erroneous req.* references",
    fnBody.length > 0 && !/\breq\./.test(fnBody),
    fnBody.length === 0 ? "function body not found" : /\breq\./.test(fnBody) ? "found req.* inside executeProfessorV3ToolCall" : "clean",
  );
  record(
    checks,
    "execute-tool-call-uses-args-commanderName",
    "executeProfessorV3ToolCall() resolves commander via args.commanderName",
    fnBody.includes("args.commanderName"),
    fnBody.length === 0 ? "function body not found" : undefined,
  );
}

async function buildZadaContext(caseId: string) {
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

async function main() {
  loadProjectEnvLocal();
  const checks: Check[] = [];
  const generatedAt = new Date().toISOString();

  record(
    checks,
    "live-root-no-model",
    "Live execution authorization root re-locked to NO_MODEL",
    PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION === PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8 &&
      PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized === false,
    `decision=${PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.decision}`,
  );

  const fixtureSha = sha256File(PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_ABSOLUTE_PATH);
  record(
    checks,
    "frozen-attempt-000-sha256",
    "Frozen spent Zada attempt-000-parsed-response.json SHA256 unchanged",
    fixtureSha === PROFESSOR_V3_ZADA_SPENT_ATTEMPT_000_PARSED_RESPONSE_SHA256,
    `got=${fixtureSha}`,
  );

  auditExecuteProfessorV3ToolCallSource(checks);

  const frozenEnvelope = loadProfessorV3ZadaSpentAttempt000ParsedResponseV1();
  const frozenToolRequests = [...frozenEnvelope.toolRequests];
  const seededModelResponse = {
    parsed: frozenEnvelope.parsed,
    toolRequests: [...frozenEnvelope.toolRequests],
  };
  record(
    checks,
    "frozen-tool-request-count-four",
    "Frozen attempt-000 contains exactly four TOOL_REQUESTS",
    frozenEnvelope.toolRequests.length === 4,
    `count=${frozenEnvelope.toolRequests.length}`,
  );
  const frozenModes = [...new Set(frozenToolRequests.map((r) => r.mode))].sort();
  record(
    checks,
    "frozen-modes-commander-package-rules",
    "Frozen requests cover COMMANDER_PRIMER, PACKAGE, and RULES",
    frozenModes.includes("COMMANDER_PRIMER") &&
      frozenModes.includes("PACKAGE") &&
      frozenModes.includes("RULES"),
    frozenModes.join(", "),
  );

  let replayEvidence: Awaited<ReturnType<typeof replayProfessorV3ZadaSpentToolLoopOfflineV1>> | null = null;
  try {
    replayEvidence = await replayProfessorV3ZadaSpentToolLoopOfflineV1();
    record(
      checks,
      "offline-replay-four-tools-complete",
      "All four frozen tool requests execute through production executeProfessorV3ToolCall()",
      replayEvidence.completedToolCallCount === 4,
      `completed=${replayEvidence.completedToolCallCount}`,
    );
    record(
      checks,
      "offline-replay-modes-match-frozen",
      "Replay executes the same retrieval modes as the frozen envelope",
      replayEvidence.modesExecuted.join("|") === frozenToolRequests.map((r) => r.mode).join("|"),
      `executed=${replayEvidence.modesExecuted.join(", ")}`,
    );
    record(
      checks,
      "offline-replay-commander-primer-mismatch-zero",
      "COMMANDER_PRIMER scoping keeps mismatchedCommanderPrimerCount=0",
      replayEvidence.mismatchedCommanderPrimerCount === 0,
      `mismatched=${replayEvidence.mismatchedCommanderPrimerCount}; commanderPrimers=${replayEvidence.commanderPrimerCount}`,
    );
    record(
      checks,
      "offline-replay-no-foreign-commander-primer",
      "No foreign commander_primer enters replay context",
      replayEvidence.foreignCommanderPrimerCount === 0,
      `foreign=${replayEvidence.foreignCommanderPrimerCount}`,
    );
    record(
      checks,
      "offline-replay-rules-evidence-present",
      "RULES retrieval returns authoritative rules evidence",
      replayEvidence.rulesEvidenceCount > 0,
      `rulesEvidenceCount=${replayEvidence.rulesEvidenceCount}`,
    );
    record(
      checks,
      "offline-replay-dedupe-countable",
      "Duplicate retrieval evidence IDs are countable after replay",
      replayEvidence.duplicateRetrievalEvidenceCount >= 0,
      `duplicateRetrievalEvidenceCount=${replayEvidence.duplicateRetrievalEvidenceCount}`,
    );
    record(
      checks,
      "offline-replay-post-tool-user-content",
      "Post-tool model user-content includes accumulated tool results",
      replayEvidence.postToolUserContentIncludesToolResults && replayEvidence.postToolUserContentBytes > 0,
      `bytes=${replayEvidence.postToolUserContentBytes}`,
    );
    record(
      checks,
      "offline-replay-retrieval-events",
      "Tool replay records retrieval events in run ledger with provenance",
      replayEvidence.retrievalEventCount >= 4,
      `retrievalEventCount=${replayEvidence.retrievalEventCount}`,
    );
  } catch (err) {
    record(
      checks,
      "offline-replay-four-tools-complete",
      "All four frozen tool requests execute through production executeProfessorV3ToolCall()",
      false,
      String(err),
    );
  }

  const modelPin = loadProfessorModelPinV2();
  const toolBudget = {
    allowedTools: ["searchMtgKnowledge"] as const,
    allowedKnowledgeModes: ["COMMANDER_PRIMER", "PACKAGE", "RULES", "CARD_ORACLE"] as const,
    maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
    maxRetrievedEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
  };

  let boundaryAttemptIndex: number | null = null;
  let boundaryAfterToolResults: boolean | null = null;
  let lastProgress: ProfessorV3OrchestrationProgressV3 | null = null;
  const budgetGuard = createProfessorV3ModelCallBudgetGuardV1(4);
  const ctx = await buildZadaContext("professor-v3-smoke-zada-prospective-v1");
  const initialRetrievalEvents = initRunLedgerFromContext(ctx).retrievalEvents.length;

  try {
    await runProfessorPlanCaseV3Orchestration({
      ctx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      requireLensCoverage: false,
      maxRepairRounds: 0,
      toolBudget,
      parsedModelResponse: seededModelResponse,
      onProgress: (progress) => {
        lastProgress = progress;
      },
      modelCaller: wrapProfessorV3ModelCallerWithBudgetV1({
        budgetGuard,
        modelCaller: async (input) => {
          boundaryAttemptIndex = input.attemptIndex;
          boundaryAfterToolResults = input.afterToolResults;
          throw new Error(PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1);
        },
      }),
    });
    record(
      checks,
      "orchestration-post-tool-model-boundary",
      "Orchestration reaches attempt-001 MODEL_REQUEST boundary after frozen tool batch",
      false,
      "expected boundary throw",
    );
  } catch (err) {
    record(
      checks,
      "orchestration-post-tool-model-boundary",
      "Orchestration reaches attempt-001 MODEL_REQUEST boundary after frozen tool batch",
      boundaryAttemptIndex === 0 &&
        boundaryAfterToolResults === true &&
        err instanceof Error &&
        err.message === PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1,
      `attemptIndex=${boundaryAttemptIndex}; afterToolResults=${boundaryAfterToolResults}; stage=${lastProgress?.executionStage}; err=${String(err)}`,
    );
  }

  record(
    checks,
    "orchestration-drains-tool-batch-before-model",
    "Orchestration executes all four frozen tool requests before post-tool model call",
    (lastProgress?.professorToolCallCompletedCount ?? 0) === 4 &&
      (lastProgress?.runLedger.retrievalEvents.length ?? 0) >= initialRetrievalEvents + 4,
    `completed=${lastProgress?.professorToolCallCompletedCount ?? 0}; retrievalEvents=${lastProgress?.runLedger.retrievalEvents.length ?? 0}; initial=${initialRetrievalEvents}`,
  );

  record(
    checks,
    "model-call-budget-attempt-004-blocked",
    "maxModelApiCalls=4 blocks attempt index 4 before OpenAI",
    (() => {
      try {
        budgetGuard.assertCallAllowed(4);
        return false;
      } catch (error) {
        return isProfessorV3ModelCallBudgetExhaustedErrorV1(error);
      }
    })(),
    `apiCallsMade=${budgetGuard.apiCallsMade}; code=${PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1}`,
  );

  let toolFailureProgress: ProfessorV3OrchestrationProgressV3 | null = null;
  try {
    await runProfessorPlanCaseV3Orchestration({
      ctx: await buildZadaContext("professor-v3-tool-failure-fixture-v1"),
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      requireLensCoverage: false,
      parsedModelResponse: { toolRequests: [frozenToolRequests[0]] },
      fakeToolHits: () => {
        throw new Error("SIMULATED_TOOL_EXECUTION_FAILURE");
      },
      modelCaller: async () => ({ parsed: null }),
      onProgress: (progress) => {
        toolFailureProgress = progress;
      },
    });
  } catch (err) {
    record(
      checks,
      "tool-exception-propagation",
      "Tool execution exception propagates from production tool path",
      err instanceof Error && err.message === "SIMULATED_TOOL_EXECUTION_FAILURE",
      String(err),
    );
  }

  record(
    checks,
    "tool-metrics-attempt-vs-completed",
    "Professor tool-call accounting distinguishes attempted vs completed on tool failure",
    toolFailureProgress?.professorToolCallAttemptCount === 1 &&
      toolFailureProgress?.professorToolCallCompletedCount === 0,
    `attempted=${toolFailureProgress?.professorToolCallAttemptCount ?? 0}; completed=${toolFailureProgress?.professorToolCallCompletedCount ?? 0}`,
  );

  const directToolCall = await executeProfessorV3ToolCall({
    ctx,
    runLedger: initRunLedgerFromContext(ctx),
    callIndex: 0,
    tool: "searchMtgKnowledge",
    query: frozenToolRequests[0].query,
    mode: frozenToolRequests[0].mode,
    limit: 4,
  });
  record(
    checks,
    "execute-tool-call-direct-no-reference-error",
    "executeProfessorV3ToolCall() runs without ReferenceError on real frozen request",
    Array.isArray(directToolCall.record.evidenceIds),
    `evidenceIds=${directToolCall.record.evidenceIds.length}`,
  );

  const sealFixtureDir = mkdtempSync(join(tmpdir(), "post-zada-tool-loop-seal-"));
  mkdirSync(join(sealFixtureDir, "attempts"), { recursive: true });
  const seal = sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
    targets: {
      manifest: join(sealFixtureDir, "manifest.json"),
      result: join(sealFixtureDir, "result.json"),
      failure: join(sealFixtureDir, "failure.json"),
      executionTrace: join(sealFixtureDir, "trace.json"),
      runLedger: join(sealFixtureDir, "ledger.json"),
      stdout: join(sealFixtureDir, "stdout.txt"),
      stderr: join(sealFixtureDir, "stderr.txt"),
      modelAttemptsDir: join(sealFixtureDir, "attempts"),
    },
    caseId: "professor-v3-smoke-zada-prospective-v1",
    mechanismTruthCaseId: "multi-zada",
    stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
    executionStage: "TOOL_LOOP",
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    reviewedExecutionIdentity: {
      version: "phase6a1-professor-v3-smoke-execution-identity-v10-zada-executable-v1",
      decision: "PROFESSOR_V3_POST_ZADA_TOOL_LOOP_EXECUTION_REPAIR_V1_AUTHORIZED_NO_MODEL",
      stackIdentity: "professor-v3-zada-smoke-execution-tree-v1-prospective",
      prospectiveCaseId: "professor-v3-smoke-zada-prospective-v1",
      mechanismTruthCaseId: "multi-zada",
      executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-zada-prospective-v1.ts",
      executeRunnerSha256: "c4fe2ef01f8cef5a8e6a2cde923fb59d7cc43ec6d847a536df013715baa67cc4",
      executionPinsArtifactRelativePath:
        "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v10-zada-executable-v1.json",
      executionPinsArtifactSha256: "835d2831411bf002250fb38c5db16c99d3960e1a6d682a13318c14ca092ad555",
      dependencyManifestSha256: "4f3cb13fefc60a4b777d753b70f0f2c9bcec07e408b9991049aabd65bd192f43",
    },
    materialPins: { fileCount: 0, files: [] },
    modelAttemptArtifacts: [],
    executionTrace: null,
    runLedger: null,
    stdout: "",
    stderr: "",
    decision: "PROFESSOR_V3_POST_ZADA_TOOL_LOOP_EXECUTION_REPAIR_V1_AUTHORIZED_NO_MODEL",
    error: new ReferenceError("req is not defined"),
    professorToolCallAttemptCount: 1,
    professorToolCallCompletedCount: 0,
  });
  record(
    checks,
    "terminal-seal-failed-exception",
    "Tool exception terminal-seals as FAILED_EXCEPTION with attempted/completed counters",
    seal.terminalOutcome === "FAILED_EXCEPTION" &&
      seal.attemptAccounting.professorToolCallAttemptCount === 1 &&
      seal.attemptAccounting.professorToolCallCompletedCount === 0 &&
      seal.attemptAccounting.professorToolCallCount === 0,
    `terminalOutcome=${seal.terminalOutcome}; attempted=${seal.attemptAccounting.professorToolCallAttemptCount}; completed=${seal.attemptAccounting.professorToolCallCompletedCount}`,
  );

  if (existsSync(sealFixtureDir)) rmSync(sealFixtureDir, { recursive: true, force: true });

  const passed = checks.filter((c) => c.pass).length;
  const audit = {
    version: "phase6a1-professor-v3-post-zada-tool-loop-repair-audit-v1",
    generatedAt,
    decision: "PROFESSOR_V3_POST_ZADA_TOOL_LOOP_EXECUTION_REPAIR_V1_AUTHORIZED_NO_MODEL",
    openAiCallCount: 0,
    totalChecks: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
    replayEvidence,
    sourceHashes: {
      phase6a1ProfessorPlanAgentV3: sha256File(join(MILESTONES, "../../../scripts/lib/phase6a1-professor-plan-agent-v3.ts")),
      phase6a1ProfessorV3SmokeExecutionAuthorizationLiveRootV1: sha256File(
        join(MILESTONES, "../../../scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts"),
      ),
      phase6a1ProfessorV3PostZadaToolLoopReplayV1: sha256File(
        join(MILESTONES, "../../../scripts/lib/phase6a1-professor-v3-post-zada-tool-loop-replay-v1.ts"),
      ),
      phase6a1ProfessorV3ZadaSpentToolLoopFixtureV1: sha256File(
        join(MILESTONES, "../../../scripts/lib/phase6a1-professor-v3-zada-spent-tool-loop-fixture-v1.ts"),
      ),
      frozenAttempt000ParsedResponse: fixtureSha,
    },
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath: OUT_PATH, passed, failed: checks.length - passed }, null, 2));
  if (passed !== checks.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
