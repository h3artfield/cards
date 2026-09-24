/**
 * Professor PLAN agent v3 — orchestration with model/tool/model loop; execution fail-closed until authorized.
 */
import { createHash } from "node:crypto";
import type { MtgKnowledgeEvidence, MtgKnowledgeRetrievalMode } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import { searchMtgKnowledge } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type {
  ProfessorPlanningContextV3,
  ProfessorPlanToolBudgetV3,
  ProfessorPlanToolNameV3,
  StrategyHypothesisV3,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 as DEFAULT_TOOL_BUDGET } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  appendModelAttemptTrace,
  appendRepairAttemptTrace,
  createExecutionTrace,
  sha256Json,
  traceSummary,
  type ProfessorExecutionTraceV1,
} from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import {
  appendRetrievalEvent,
  initRunLedgerFromContext,
  runLedgerSha256,
  syncContextFromRunLedger,
  type ProfessorRunLedgerV3,
} from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import {
  buildValidatorContextV3FromPlanning,
  validateProfessorPlanLensCoverageV3,
  validateProfessorPlanOutputV3,
  STRATEGY_PACKAGE_VALIDATOR_V3_VERSION,
} from "../../src/lib/deck-synthesis/strategy-package-validator-v3";
import {
  auditProfessorPlanningContextPreflightV3,
  PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V3_VERSION,
} from "./phase6a1-professor-plan-context-preflight-v3";
import { PROFESSOR_PLAN_PROMPT_V3_VERSION, PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import {
  normalizeProfessorPlanningResponseV3,
  PROFESSOR_PLAN_NORMALIZER_V3_VERSION,
  type NormalizationResultV3,
} from "./phase6a1-professor-plan-normalizer-v3";
import { buildProfessorV3NormalizationRepairPromptV2 } from "./phase6a1-professor-v3-plan-output-schema-v2";
import { buildProfessorV3PromptPayload, type ProfessorV3PromptPayloadV1 } from "./phase6a1-professor-v3-prompt-payload-v1";
import { buildProfessorV3BudgetTelemetryContextFromPlanningContext } from "./phase6a1-professor-v3-budget-telemetry-v1";
import { isProfessorV3ModelResponseBoundaryError } from "./phase6a1-professor-v3-model-response-boundary-v1";

export const PROFESSOR_PLAN_AGENT_V3_VERSION = "phase6a1-professor-plan-agent-v3";
export const PROFESSOR_V3_EXECUTION_STATUS = "ARCHITECTURE_REVIEW_ONLY_NO_MODEL_EXECUTION";
export const PROFESSOR_V3_MODEL_AUTHORIZATION = "BLOCKED" as const;

export type ProfessorModelAuthorizationV3 = "BLOCKED" | "AUTHORIZED";
export type ProfessorV3ExecutionModeV3 = "ARCHITECTURE_REVIEW" | "REAL_SMOKE";
export type ProfessorV3RealExecutionStatusV3 =
  | "MODEL_EXECUTION_AUTHORIZED"
  | "SUCCESS"
  | "NORMALIZATION_FAILURE"
  | "GROUNDING_FAILURE"
  | "TOOL_VALIDATION_FAILURE"
  | "REPAIR_EXHAUSTED"
  | "MODEL_CALL_BUDGET_EXHAUSTED"
  | "FAILED_EXCEPTION"
  | "PROFESSOR_CONTEXT_UNSATISFIABLE";
export type ProfessorV3ExecutionStatusV3 = typeof PROFESSOR_V3_EXECUTION_STATUS | ProfessorV3RealExecutionStatusV3;
export type ProfessorOrchestrationPhaseV3 =
  | "PREFLIGHT"
  | "LEDGER"
  | "PAYLOAD"
  | "MODEL_REQUEST"
  | "TOOL_LOOP"
  | "NORMALIZE"
  | "VALIDATE"
  | "REPAIR"
  | "COMPLETE";

export type ProfessorCaseStatusV3 =
  | "ARCHITECTURE_REVIEW_ONLY"
  | "SUCCESS"
  | "PROFESSOR_CONTEXT_UNSATISFIABLE"
  | "NORMALIZATION_FAILURE"
  | "GROUNDING_FAILURE"
  | "MODEL_EXECUTION_NOT_AUTHORIZED"
  | "TOOL_VALIDATION_FAILURE"
  | "REPAIR_EXHAUSTED"
  | "MODEL_CALL_BUDGET_EXHAUSTED";

export type ProfessorToolCallRecordV3 = {
  callIndex: number;
  tool: string;
  query?: string;
  retrievalMode?: string;
  evidenceIds: string[];
  acceptedLimit?: number;
  rejectedReason?: string;
};

export type ProfessorRepairRoundRecordV3 = {
  round: number;
  validationOutcomes: ReturnType<typeof validateProfessorPlanOutputV3>;
  repairPrompt?: string;
  normalizationIssues?: NormalizationResultV3 extends { status: "NORMALIZATION_FAILURE"; issues: infer I } ? I : never;
};

export type ProfessorV3OrchestrationProgressV3 = {
  executionStage: ProfessorOrchestrationPhaseV3;
  executionTrace: ProfessorExecutionTraceV1;
  runLedger: ProfessorRunLedgerV3;
  professorToolCallAttemptCount: number;
  professorToolCallCompletedCount: number;
};

export type ProfessorV3ModelAttemptArtifactSinkV1 = (args: {
  attemptIndex: number;
  systemPrompt: string;
  userPayload: ProfessorV3PromptPayloadV1;
  repairPrompt?: string;
  rawResponse: unknown;
  afterToolResults: boolean;
}) => {
  systemPromptArtifact: string;
  userPayloadArtifact: string;
  repairPromptArtifact: string | null;
  rawResponseArtifact: string;
};

export type ProfessorCaseOrchestrationRecordV3 = {
  version: typeof PROFESSOR_PLAN_AGENT_V3_VERSION;
  executionMode: ProfessorV3ExecutionModeV3;
  executionStatus: ProfessorV3ExecutionStatusV3;
  modelAuthorization: ProfessorModelAuthorizationV3;
  caseId: string;
  caseStatus: ProfessorCaseStatusV3;
  phasesExecuted: ProfessorOrchestrationPhaseV3[];
  contextPreflightVersion: typeof PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V3_VERSION;
  promptVersion: typeof PROFESSOR_PLAN_PROMPT_V3_VERSION;
  normalizerVersion: typeof PROFESSOR_PLAN_NORMALIZER_V3_VERSION;
  validatorVersion: typeof STRATEGY_PACKAGE_VALIDATOR_V3_VERSION;
  evidenceLedgerSha256: string;
  runLedgerSha256: string;
  runLedger: ProfessorRunLedgerV3;
  executionTrace: ProfessorExecutionTraceV1;
  traceSummary: ReturnType<typeof traceSummary>;
  toolCalls: ProfessorToolCallRecordV3[];
  repairRounds: ProfessorRepairRoundRecordV3[];
  maxRepairRounds: number;
  normalization: NormalizationResultV3 | null;
  validationOutcomes: ReturnType<typeof validateProfessorPlanOutputV3> | null;
  lensCoverageIssues: ReturnType<typeof validateProfessorPlanLensCoverageV3>;
  promptPayload: ProfessorV3PromptPayloadV1 | null;
  note: string;
  professorToolCallAttemptCount: number;
  professorToolCallCompletedCount: number;
};

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function assertProfessorV3ModelExecutionNotAuthorized(): void {
  throw new Error("FAIL_CLOSED: Professor v3 model execution is not authorized — architecture review only");
}

export type ProfessorV3ToolRequest = {
  tool: ProfessorPlanToolNameV3;
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  commanderName?: string;
  limit?: number;
};

export type ProfessorV3ModelResponse = {
  parsed: unknown;
  toolRequests?: ProfessorV3ToolRequest[];
};

export type ProfessorV3ModelCallerInput = {
  attemptIndex: number;
  systemPrompt: string;
  userPayload: ProfessorV3PromptPayloadV1;
  repairPrompt?: string;
  afterToolResults: boolean;
  budgetTelemetryContext?: {
    resolvedCommanderNames: string[];
    ragEvidence: Array<{ chunkId: string; corpus: string; commander?: string }>;
    retrievalEventEvidenceIds: string[][];
  };
};

export function coerceProfessorV3ToolRequest(
  value: unknown,
): { ok: true; req: ProfessorV3ToolRequest } | { ok: false; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "Tool request must be a runtime object" };
  }
  const obj = value as Record<string, unknown>;
  if (obj.tool !== "searchMtgKnowledge") {
    return { ok: false, reason: `Invalid or unsupported tool '${String(obj.tool)}'` };
  }
  if (typeof obj.query !== "string" || !obj.query.trim()) {
    return { ok: false, reason: "Tool query must be nonblank string" };
  }
  if (typeof obj.mode !== "string" || !obj.mode.trim()) {
    return { ok: false, reason: "Retrieval mode must be nonblank string" };
  }
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== "number" || !Number.isInteger(obj.limit) || obj.limit <= 0) {
      return { ok: false, reason: "limit must be a positive integer when supplied" };
    }
  }
  if (obj.commanderName !== undefined && (typeof obj.commanderName !== "string" || !obj.commanderName.trim())) {
    return { ok: false, reason: "commanderName must be nonblank string when supplied" };
  }
  return {
    ok: true,
    req: {
      tool: "searchMtgKnowledge",
      query: obj.query.trim(),
      mode: obj.mode.trim() as MtgKnowledgeRetrievalMode,
      commanderName: typeof obj.commanderName === "string" ? obj.commanderName.trim() : undefined,
      limit: typeof obj.limit === "number" ? obj.limit : undefined,
    },
  };
}

export function validateProfessorV3ToolRequest(args: {
  req: ProfessorV3ToolRequest;
  budget: ProfessorPlanToolBudgetV3;
  toolCallsSoFar: number;
  chunksRetrievedSoFar: number;
}): { ok: true; cappedLimit: number } | { ok: false; reason: string } {
  const coerced = coerceProfessorV3ToolRequest(args.req);
  if (!coerced.ok) return coerced;
  const req = coerced.req;
  if (!args.budget.allowedTools.includes(req.tool)) {
    return { ok: false, reason: `Tool '${req.tool}' is not allowed` };
  }
  if (!args.budget.allowedKnowledgeModes.includes(req.mode)) {
    return { ok: false, reason: `Retrieval mode '${req.mode}' is not allowed` };
  }
  if (args.toolCallsSoFar >= args.budget.maxToolCalls) {
    return { ok: false, reason: "maxToolCalls budget exhausted" };
  }
  const remaining = args.budget.maxRetrievedEvidenceChunks - args.chunksRetrievedSoFar;
  if (remaining <= 0) return { ok: false, reason: "maxRetrievedEvidenceChunks budget exhausted" };
  const requested = req.limit ?? 4;
  return { ok: true, cappedLimit: Math.max(1, Math.min(requested, remaining)) };
}

export async function executeProfessorV3ToolCall(args: {
  ctx: ProfessorPlanningContextV3;
  runLedger: ProfessorRunLedgerV3;
  tool: "searchMtgKnowledge";
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  commanderName?: string;
  limit?: number;
  callIndex: number;
  fakeHits?: MtgKnowledgeEvidence[];
}): Promise<{
  ctx: ProfessorPlanningContextV3;
  runLedger: ProfessorRunLedgerV3;
  record: ProfessorToolCallRecordV3;
}> {
  const resolvedCommanderNames = args.commanderName?.trim()
    ? [args.commanderName.trim()]
    : args.ctx.commandZone.commanders;
  const hits =
    args.fakeHits ??
    (
      await searchMtgKnowledge({
        query: args.query,
        mode: args.mode,
        consumer: "professor_planner",
        commanderName: resolvedCommanderNames[0],
        resolvedCommanderNames,
        limit: args.limit ?? 4,
      })
    ).hits;
  const runLedger = appendRetrievalEvent({
    runLedger: args.runLedger,
    hits,
    tool: args.tool,
    query: args.query,
    retrievalMode: args.mode,
  });
  const ctx = syncContextFromRunLedger(args.ctx, runLedger);
  return {
    ctx,
    runLedger,
    record: {
      callIndex: args.callIndex,
      tool: args.tool,
      query: args.query,
      retrievalMode: args.mode,
      evidenceIds: hits.map((h) => h.chunkId),
      acceptedLimit: args.limit,
    },
  };
}

function buildNormalizationRepairPrompt(args: {
  normalization: Extract<NormalizationResultV3, { status: "NORMALIZATION_FAILURE" }>;
}): string {
  return buildProfessorV3NormalizationRepairPromptV2({ issues: args.normalization.issues });
}

function buildRepairPrompt(args: {
  validationOutcomes: ReturnType<typeof validateProfessorPlanOutputV3>;
  lensCoverageIssues: ReturnType<typeof validateProfessorPlanLensCoverageV3>;
}): string {
  const issues = [
    ...args.validationOutcomes.flatMap((r) => r.issues.filter((i) => i.severity === "ERROR").map((i) => i.message)),
    ...args.lensCoverageIssues.map((i) => i.message),
  ];
  return [
    "Repair your prior JSON output. Fix grounding/normalization issues without inventing mechanics.",
    ...issues.map((m) => `- ${m}`),
    "Re-read evidence IDs and typed assertion vocabulary in the current payload above.",
  ].join("\n");
}

function allGrounded(outcomes: ReturnType<typeof validateProfessorPlanOutputV3>): boolean {
  return outcomes.every((r) => r.outcome === "GROUNDED" || r.outcome === "GROUNDED_WITH_CONSTRAINT");
}

function countRetrievedChunks(toolCalls: ProfessorToolCallRecordV3[]): number {
  return toolCalls.reduce((n, t) => n + t.evidenceIds.length, 0);
}

function resolveExecutionStatus(args: {
  executionMode: ProfessorV3ExecutionModeV3;
  realOutcome: ProfessorV3RealExecutionStatusV3;
}): ProfessorV3ExecutionStatusV3 {
  if (args.executionMode === "ARCHITECTURE_REVIEW") return PROFESSOR_V3_EXECUTION_STATUS;
  return args.realOutcome;
}

function resolveSuccessCaseStatus(executionMode: ProfessorV3ExecutionModeV3): ProfessorCaseStatusV3 {
  return executionMode === "REAL_SMOKE" ? "SUCCESS" : "ARCHITECTURE_REVIEW_ONLY";
}

function recordModelAttempt(args: {
  executionTrace: ProfessorExecutionTraceV1;
  attemptIndex: number;
  systemPrompt: string;
  userPayload: ProfessorV3PromptPayloadV1;
  repairPrompt?: string;
  rawResponse: unknown;
  afterToolResults?: boolean;
  artifactSink?: ProfessorV3ModelAttemptArtifactSinkV1;
}): ProfessorExecutionTraceV1 {
  const artifacts = args.artifactSink
    ? args.artifactSink({
        attemptIndex: args.attemptIndex,
        systemPrompt: args.systemPrompt,
        userPayload: args.userPayload,
        repairPrompt: args.repairPrompt,
        rawResponse: args.rawResponse,
        afterToolResults: Boolean(args.afterToolResults),
      })
    : undefined;
  return appendModelAttemptTrace({
    trace: args.executionTrace,
    attemptIndex: args.attemptIndex,
    systemPrompt: args.systemPrompt,
    userPayload: args.userPayload,
    repairPrompt: args.repairPrompt,
    rawResponse: args.rawResponse,
    afterToolResults: args.afterToolResults,
    artifacts,
  });
}

async function invokeProfessorV3ModelCallerWithAttemptTrace(args: {
  modelCaller: (input: ProfessorV3ModelCallerInput) => Promise<ProfessorV3ModelResponse>;
  executionTrace: ProfessorExecutionTraceV1;
  modelAttemptIndex: number;
  systemPrompt: string;
  userPayload: ProfessorV3PromptPayloadV1;
  repairPrompt?: string;
  afterToolResults: boolean;
  budgetTelemetryContext?: ProfessorV3ModelCallerInput["budgetTelemetryContext"];
  artifactSink?: ProfessorV3ModelAttemptArtifactSinkV1;
  onAttemptRecorded?: (nextTrace: ProfessorExecutionTraceV1, nextAttemptIndex: number) => void;
}): Promise<{ modelResponse: ProfessorV3ModelResponse; executionTrace: ProfessorExecutionTraceV1; modelAttemptIndex: number }> {
  try {
    const modelResponse = await args.modelCaller({
      attemptIndex: args.modelAttemptIndex,
      systemPrompt: args.systemPrompt,
      userPayload: args.userPayload,
      repairPrompt: args.repairPrompt,
      afterToolResults: args.afterToolResults,
      budgetTelemetryContext: args.budgetTelemetryContext,
    });
    const executionTrace = recordModelAttempt({
      executionTrace: args.executionTrace,
      attemptIndex: args.modelAttemptIndex,
      systemPrompt: args.systemPrompt,
      userPayload: args.userPayload,
      repairPrompt: args.repairPrompt,
      rawResponse: modelResponse,
      afterToolResults: args.afterToolResults,
      artifactSink: args.artifactSink,
    });
    const modelAttemptIndex = args.modelAttemptIndex + 1;
    args.onAttemptRecorded?.(executionTrace, modelAttemptIndex);
    return { modelResponse, executionTrace, modelAttemptIndex };
  } catch (error) {
    if (isProfessorV3ModelResponseBoundaryError(error) && error.rawResponseForTrace) {
      const executionTrace = recordModelAttempt({
        executionTrace: args.executionTrace,
        attemptIndex: args.modelAttemptIndex,
        systemPrompt: args.systemPrompt,
        userPayload: args.userPayload,
        repairPrompt: args.repairPrompt,
        rawResponse: error.rawResponseForTrace,
        afterToolResults: args.afterToolResults,
        artifactSink: args.artifactSink,
      });
      const modelAttemptIndex = args.modelAttemptIndex + 1;
      args.onAttemptRecorded?.(executionTrace, modelAttemptIndex);
    }
    throw error;
  }
}

function buildOrchestrationRecord(args: {
  executionMode: ProfessorV3ExecutionModeV3;
  realOutcome: ProfessorV3RealExecutionStatusV3;
  modelAuthorization: ProfessorModelAuthorizationV3;
  caseId: string;
  caseStatus: ProfessorCaseStatusV3;
  phasesExecuted: ProfessorOrchestrationPhaseV3[];
  runLedger: ProfessorRunLedgerV3;
  executionTrace: ProfessorExecutionTraceV1;
  toolCalls: ProfessorToolCallRecordV3[];
  repairRounds: ProfessorRepairRoundRecordV3[];
  maxRepairRounds: number;
  normalization: NormalizationResultV3 | null;
  validationOutcomes: ReturnType<typeof validateProfessorPlanOutputV3> | null;
  lensCoverageIssues: ReturnType<typeof validateProfessorPlanLensCoverageV3>;
  promptPayload: ProfessorV3PromptPayloadV1 | null;
  note: string;
  professorToolCallAttemptCount?: number;
  professorToolCallCompletedCount?: number;
}): ProfessorCaseOrchestrationRecordV3 {
  return {
    version: PROFESSOR_PLAN_AGENT_V3_VERSION,
    executionMode: args.executionMode,
    executionStatus: resolveExecutionStatus({ executionMode: args.executionMode, realOutcome: args.realOutcome }),
    modelAuthorization: args.modelAuthorization,
    caseId: args.caseId,
    caseStatus: args.caseStatus,
    phasesExecuted: args.phasesExecuted,
    contextPreflightVersion: PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V3_VERSION,
    promptVersion: PROFESSOR_PLAN_PROMPT_V3_VERSION,
    normalizerVersion: PROFESSOR_PLAN_NORMALIZER_V3_VERSION,
    validatorVersion: STRATEGY_PACKAGE_VALIDATOR_V3_VERSION,
    evidenceLedgerSha256: sha256Json(args.runLedger),
    runLedgerSha256: runLedgerSha256(args.runLedger),
    runLedger: args.runLedger,
    executionTrace: args.executionTrace,
    traceSummary: traceSummary({ trace: args.executionTrace, runLedger: args.runLedger }),
    toolCalls: args.toolCalls,
    repairRounds: args.repairRounds,
    maxRepairRounds: args.maxRepairRounds,
    normalization: args.normalization,
    validationOutcomes: args.validationOutcomes,
    lensCoverageIssues: args.lensCoverageIssues,
    promptPayload: args.promptPayload,
    note: args.note,
    professorToolCallAttemptCount: args.professorToolCallAttemptCount ?? 0,
    professorToolCallCompletedCount: args.professorToolCallCompletedCount ?? 0,
  };
}

export async function runProfessorPlanCaseV3Orchestration(args: {
  ctx: ProfessorPlanningContextV3;
  parsedModelResponse?: unknown;
  modelAuthorization?: ProfessorModelAuthorizationV3;
  executionMode?: ProfessorV3ExecutionModeV3;
  maxRepairRounds?: number;
  toolBudget?: ProfessorPlanToolBudgetV3;
  requireLensCoverage?: boolean;
  modelCaller?: (input: ProfessorV3ModelCallerInput) => Promise<ProfessorV3ModelResponse>;
  modelAttemptArtifactSink?: ProfessorV3ModelAttemptArtifactSinkV1;
  fakeToolHits?: (req: ProfessorV3ToolRequest) => MtgKnowledgeEvidence[];
  onProgress?: (progress: ProfessorV3OrchestrationProgressV3) => void;
}): Promise<ProfessorCaseOrchestrationRecordV3> {
  const phasesExecuted: ProfessorOrchestrationPhaseV3[] = [];
  const toolCalls: ProfessorToolCallRecordV3[] = [];
  const repairRounds: ProfessorRepairRoundRecordV3[] = [];
  let professorToolCallAttemptCount = 0;
  let professorToolCallCompletedCount = 0;
  const maxRepairRounds = args.maxRepairRounds ?? 2;
  const toolBudget = args.toolBudget ?? DEFAULT_TOOL_BUDGET;
  const modelAuthorization = args.modelAuthorization ?? PROFESSOR_V3_MODEL_AUTHORIZATION;
  const executionMode = args.executionMode ?? "ARCHITECTURE_REVIEW";
  const requireLensCoverage = args.requireLensCoverage ?? false;
  let workingCtx = args.ctx;
  let runLedger = initRunLedgerFromContext(workingCtx);
  let executionTrace = createExecutionTrace(workingCtx.caseId);
  let modelAttemptIndex = 0;
  let executionStage: ProfessorOrchestrationPhaseV3 = "PREFLIGHT";

  const emitProgress = () => {
    args.onProgress?.({
      executionStage,
      executionTrace,
      runLedger,
      professorToolCallAttemptCount,
      professorToolCallCompletedCount,
    });
  };

  const finish = (
    partial: Omit<
      Parameters<typeof buildOrchestrationRecord>[0],
      "professorToolCallAttemptCount" | "professorToolCallCompletedCount"
    >,
  ) =>
    buildOrchestrationRecord({
      ...partial,
      professorToolCallAttemptCount,
      professorToolCallCompletedCount,
    });

  phasesExecuted.push("PREFLIGHT");
  executionStage = "PREFLIGHT";
  emitProgress();
  const preflight = auditProfessorPlanningContextPreflightV3(workingCtx);
  if (!preflight.pass) {
    return finish({
      executionMode,
      realOutcome: "PROFESSOR_CONTEXT_UNSATISFIABLE",
      modelAuthorization,
      caseId: workingCtx.caseId,
      caseStatus: "PROFESSOR_CONTEXT_UNSATISFIABLE",
      phasesExecuted,
      runLedger,
      executionTrace,
      toolCalls,
      repairRounds,
      maxRepairRounds,
      normalization: null,
      validationOutcomes: null,
      lensCoverageIssues: [],
      promptPayload: null,
      note: preflight.issues.map((i) => i.message).join("; "),
    });
  }

  phasesExecuted.push("LEDGER");
  executionStage = "LEDGER";
  emitProgress();
  let promptPayload = buildProfessorV3PromptPayload(workingCtx);

  let modelResponse: ProfessorV3ModelResponse | null = null;
  if (args.parsedModelResponse !== undefined) {
    const raw = args.parsedModelResponse as Partial<ProfessorV3ModelResponse> & { strategyHypotheses?: unknown };
    if (raw && typeof raw === "object" && ("toolRequests" in raw || "parsed" in raw)) {
      modelResponse = {
        parsed: "parsed" in raw ? raw.parsed : raw,
        toolRequests: Array.isArray(raw.toolRequests) ? [...raw.toolRequests] : raw.toolRequests,
      };
    } else {
      modelResponse = { parsed: args.parsedModelResponse };
    }
  }

  if (!modelResponse) {
    phasesExecuted.push("MODEL_REQUEST");
    executionStage = "MODEL_REQUEST";
    emitProgress();
    if (modelAuthorization !== "AUTHORIZED") {
      return finish({
        executionMode,
        realOutcome: "MODEL_EXECUTION_AUTHORIZED",
        modelAuthorization,
        caseId: workingCtx.caseId,
        caseStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
        phasesExecuted: [...phasesExecuted, "PAYLOAD"],
        runLedger,
        executionTrace,
        toolCalls,
        repairRounds,
        maxRepairRounds,
        normalization: null,
        validationOutcomes: null,
        lensCoverageIssues: [],
        promptPayload,
        note: "Model call blocked — preflight + ledger + model-visible payload ready",
      });
    }
    if (!args.modelCaller) assertProfessorV3ModelExecutionNotAuthorized();
  }

  let repairPrompt: string | undefined;
  for (let round = 0; round <= maxRepairRounds; round += 1) {
    phasesExecuted.push("PAYLOAD");
    executionStage = "PAYLOAD";
    emitProgress();
    promptPayload = buildProfessorV3PromptPayload(workingCtx);

    if (!modelResponse) {
      phasesExecuted.push("MODEL_REQUEST");
      executionStage = "MODEL_REQUEST";
      emitProgress();
      const invoked = await invokeProfessorV3ModelCallerWithAttemptTrace({
        modelCaller: args.modelCaller!,
        executionTrace,
        modelAttemptIndex,
        systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
        userPayload: promptPayload,
        repairPrompt,
        afterToolResults: false,
        budgetTelemetryContext: buildProfessorV3BudgetTelemetryContextFromPlanningContext(workingCtx),
        artifactSink: args.modelAttemptArtifactSink,
        onAttemptRecorded: (nextTrace, nextAttemptIndex) => {
          executionTrace = nextTrace;
          modelAttemptIndex = nextAttemptIndex;
          emitProgress();
        },
      });
      modelResponse = invoked.modelResponse;
      executionTrace = invoked.executionTrace;
      modelAttemptIndex = invoked.modelAttemptIndex;
    }

    phasesExecuted.push("TOOL_LOOP");
    executionStage = "TOOL_LOOP";
    emitProgress();
    while (modelResponse?.toolRequests?.length) {
      const rawReq = modelResponse.toolRequests.shift();
      if (!rawReq) break;
      const coerced = coerceProfessorV3ToolRequest(rawReq);
      if (!coerced.ok) {
        toolCalls.push({
          callIndex: toolCalls.length,
          tool: typeof (rawReq as { tool?: unknown }).tool === "string" ? String((rawReq as { tool?: unknown }).tool) : "invalid",
          evidenceIds: [],
          rejectedReason: coerced.reason,
        });
        return finish({
          executionMode,
          realOutcome: "TOOL_VALIDATION_FAILURE",
          modelAuthorization,
          caseId: workingCtx.caseId,
          caseStatus: "TOOL_VALIDATION_FAILURE",
          phasesExecuted,
          runLedger,
          executionTrace,
          toolCalls,
          repairRounds,
          maxRepairRounds,
          normalization: null,
          validationOutcomes: null,
          lensCoverageIssues: [],
          promptPayload,
          note: coerced.reason,
        });
      }
      const req = coerced.req;
      const validation = validateProfessorV3ToolRequest({
        req,
        budget: toolBudget,
        toolCallsSoFar: toolCalls.length,
        chunksRetrievedSoFar: countRetrievedChunks(toolCalls),
      });
      if (!validation.ok) {
        toolCalls.push({
          callIndex: toolCalls.length,
          tool: req.tool,
          query: req.query,
          retrievalMode: req.mode,
          evidenceIds: [],
          rejectedReason: validation.reason,
        });
        return finish({
          executionMode,
          realOutcome: "TOOL_VALIDATION_FAILURE",
          modelAuthorization,
          caseId: workingCtx.caseId,
          caseStatus: "TOOL_VALIDATION_FAILURE",
          phasesExecuted,
          runLedger,
          executionTrace,
          toolCalls,
          repairRounds,
          maxRepairRounds,
          normalization: null,
          validationOutcomes: null,
          lensCoverageIssues: [],
          promptPayload,
          note: validation.reason,
        });
      }
      professorToolCallAttemptCount += 1;
      emitProgress();
      const executed = await executeProfessorV3ToolCall({
        ctx: workingCtx,
        runLedger,
        callIndex: toolCalls.length,
        tool: req.tool,
        query: req.query,
        mode: req.mode,
        commanderName: req.commanderName,
        limit: validation.cappedLimit,
        fakeHits: args.fakeToolHits?.(req),
      });
      workingCtx = executed.ctx;
      runLedger = executed.runLedger;
      toolCalls.push(executed.record);
      professorToolCallCompletedCount += 1;
      emitProgress();

      if (modelResponse.toolRequests.length > 0) {
        continue;
      }

      phasesExecuted.push("PAYLOAD");
      executionStage = "PAYLOAD";
      emitProgress();
      promptPayload = buildProfessorV3PromptPayload(workingCtx);
      phasesExecuted.push("MODEL_REQUEST");
      executionStage = "MODEL_REQUEST";
      emitProgress();
      const invoked = await invokeProfessorV3ModelCallerWithAttemptTrace({
        modelCaller: args.modelCaller!,
        executionTrace,
        modelAttemptIndex,
        systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
        userPayload: promptPayload,
        repairPrompt,
        afterToolResults: true,
        budgetTelemetryContext: buildProfessorV3BudgetTelemetryContextFromPlanningContext(workingCtx),
        artifactSink: args.modelAttemptArtifactSink,
        onAttemptRecorded: (nextTrace, nextAttemptIndex) => {
          executionTrace = nextTrace;
          modelAttemptIndex = nextAttemptIndex;
          emitProgress();
        },
      });
      modelResponse = invoked.modelResponse;
      executionTrace = invoked.executionTrace;
      modelAttemptIndex = invoked.modelAttemptIndex;
    }

    phasesExecuted.push("NORMALIZE");
    executionStage = "NORMALIZE";
    emitProgress();
    const normalization = normalizeProfessorPlanningResponseV3({ parsedModelResponse: modelResponse!.parsed, ctx: workingCtx });
    if (normalization.status !== "SUCCESS") {
      repairRounds.push({ round, validationOutcomes: [], repairPrompt, normalizationIssues: normalization.issues });
      if (round >= maxRepairRounds) {
        return finish({
          executionMode,
          realOutcome: "NORMALIZATION_FAILURE",
          modelAuthorization,
          caseId: workingCtx.caseId,
          caseStatus: "NORMALIZATION_FAILURE",
          phasesExecuted,
          runLedger,
          executionTrace,
          toolCalls,
          repairRounds,
          maxRepairRounds,
          normalization,
          validationOutcomes: null,
          lensCoverageIssues: [],
          promptPayload,
          note: `Normalization failed on round ${round} — repair budget exhausted`,
        });
      }
      if (modelAuthorization !== "AUTHORIZED" || !args.modelCaller) {
        return finish({
          executionMode,
          realOutcome: "NORMALIZATION_FAILURE",
          modelAuthorization,
          caseId: workingCtx.caseId,
          caseStatus: "NORMALIZATION_FAILURE",
          phasesExecuted,
          runLedger,
          executionTrace,
          toolCalls,
          repairRounds,
          maxRepairRounds,
          normalization,
          validationOutcomes: null,
          lensCoverageIssues: [],
          promptPayload,
          note: "Normalization failure detected — repair loop blocked without model authorization",
        });
      }
      phasesExecuted.push("REPAIR");
      executionStage = "REPAIR";
      emitProgress();
      repairPrompt = buildNormalizationRepairPrompt({ normalization });
      executionTrace = appendRepairAttemptTrace({
        trace: executionTrace,
        repairIndex: round,
        modelAttemptIndex,
        repairPrompt,
      });
      modelResponse = null;
      continue;
    }

    phasesExecuted.push("VALIDATE");
    executionStage = "VALIDATE";
    emitProgress();
    const validatorCtx = buildValidatorContextV3FromPlanning(workingCtx);
    const validationOutcomes = validateProfessorPlanOutputV3(validatorCtx, { strategyHypotheses: normalization.normalized });
    const lensCoverageIssues = requireLensCoverage ? validateProfessorPlanLensCoverageV3(normalization.normalized) : [];
    repairRounds.push({ round, validationOutcomes, repairPrompt });

    const lensOk = lensCoverageIssues.length === 0;
    if (allGrounded(validationOutcomes) && lensOk) {
      return finish({
        executionMode,
        realOutcome: "SUCCESS",
        modelAuthorization,
        caseId: workingCtx.caseId,
        caseStatus: resolveSuccessCaseStatus(executionMode),
        phasesExecuted: [...phasesExecuted, "COMPLETE"],
        runLedger,
        executionTrace,
        toolCalls,
        repairRounds,
        maxRepairRounds,
        normalization,
        validationOutcomes,
        lensCoverageIssues,
        promptPayload,
        note: "Orchestration complete — validation passed",
      });
    }

    if (round >= maxRepairRounds) {
      return finish({
        executionMode,
        realOutcome: "REPAIR_EXHAUSTED",
        modelAuthorization,
        caseId: workingCtx.caseId,
        caseStatus: "REPAIR_EXHAUSTED",
        phasesExecuted: [...phasesExecuted, "REPAIR"],
        runLedger,
        executionTrace,
        toolCalls,
        repairRounds,
        maxRepairRounds,
        normalization,
        validationOutcomes,
        lensCoverageIssues,
        promptPayload,
        note: "Repair rounds exhausted",
      });
    }

    phasesExecuted.push("REPAIR");
    executionStage = "REPAIR";
    emitProgress();
    if (modelAuthorization !== "AUTHORIZED" || !args.modelCaller) {
      return finish({
        executionMode,
        realOutcome: "GROUNDING_FAILURE",
        modelAuthorization,
        caseId: workingCtx.caseId,
        caseStatus: "GROUNDING_FAILURE",
        phasesExecuted,
        runLedger,
        executionTrace,
        toolCalls,
        repairRounds,
        maxRepairRounds,
        normalization,
        validationOutcomes,
        lensCoverageIssues,
        promptPayload,
        note: "Grounding failure detected — repair loop blocked without model authorization",
      });
    }

    repairPrompt = buildRepairPrompt({ validationOutcomes, lensCoverageIssues });
    executionTrace = appendRepairAttemptTrace({
      trace: executionTrace,
      repairIndex: round,
      modelAttemptIndex,
      repairPrompt,
    });
    modelResponse = null;
  }

  return finish({
    executionMode,
    realOutcome: "REPAIR_EXHAUSTED",
    modelAuthorization,
    caseId: workingCtx.caseId,
    caseStatus: "REPAIR_EXHAUSTED",
    phasesExecuted,
    runLedger,
    executionTrace,
    toolCalls,
    repairRounds,
    maxRepairRounds,
    normalization: null,
    validationOutcomes: null,
    lensCoverageIssues: [],
    promptPayload,
    note: "Unexpected orchestration termination",
  });
}

export async function runProfessorPlanCaseV3ArchitecturePreflightOnly(
  ctx: ProfessorPlanningContextV3,
): Promise<ProfessorCaseOrchestrationRecordV3> {
  return runProfessorPlanCaseV3Orchestration({ ctx });
}

export { buildProfessorV3PromptPayload, PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION } from "./phase6a1-professor-v3-prompt-payload-v1";

export function professorV3SystemPrompt(): string {
  return PROFESSOR_PLAN_SYSTEM_PROMPT_V3;
}

export type { StrategyHypothesisV3, ProfessorV3PromptPayloadV1 };
