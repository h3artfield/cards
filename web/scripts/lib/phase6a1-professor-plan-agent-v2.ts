/**
 * Professor PLAN agent v2 — fail-closed normalization, full audit trail, strict validation.
 * Does NOT expose BuildPath v3 gold to the model.
 */
import { createHash, randomUUID } from "node:crypto";
import { formatMtgKnowledgeEvidence, searchMtgKnowledge } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type { MtgKnowledgeRetrievalMode } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import {
  type ProfessorPlanningContext,
  type SemanticPackage,
  type StrategyHypothesis,
  type StrategyPackageValidationResult,
  type StructuredValidationIssue,
  type ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import {
  buildValidatorContextV2FromPlanning,
  validateStrategyHypothesisV2,
} from "../../src/lib/deck-synthesis/strategy-package-validator-v2";
import {
  loadProfessorModelPinV2,
  type ProfessorModelPinV2,
} from "./phase6a1-professor-plan-model-pin-v2";
import {
  normalizeProfessorPlanningResponse,
  type NormalizationAuditRecord,
} from "./phase6a1-professor-plan-normalizer-v2";
import {
  PROFESSOR_PLAN_RESPONSES_TOOLS_V2,
  PROFESSOR_PLAN_SYSTEM_PROMPT_V2,
} from "./phase6a1-professor-plan-prompt-v2";
import {
  hasUnexplainedThreeLensCollapseV5,
  selectThreeLensPortfoliosV5,
  THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
} from "./phase6a1-three-lens-portfolio-selector-v5";
import { PACKAGE_SYNERGY_GRAPH_V8_VERSION } from "./phase6a1-package-synergy-graph-v8";
import { CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION } from "./phase6a1-canonical-resource-ontology-v6";
import {
  auditProfessorPlanningContextPreflight,
  PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION,
  type ProfessorContextPreflightIssue,
} from "./phase6a1-professor-plan-context-preflight-v1";

export const PROFESSOR_PLAN_AGENT_V2_VERSION = "phase6a1-professor-plan-agent-v2";
export type { ProfessorModelPinV2 };

export type ProfessorToolCallRecordV2 = {
  callIndex: number;
  tool: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
  evidenceChunkIds: string[];
};

export type ProfessorInvocationRecordV2 = {
  taskId: string;
  attemptId: string;
  round: number;
  systemPrompt: string;
  userPrompt: string;
  systemPromptHash: string;
  userPromptHash: string;
  rawModelResponse: string;
  parsedModelResponse: unknown;
  normalization: NormalizationAuditRecord;
  validationInput: StrategyHypothesis[] | null;
  validationResults: StrategyPackageValidationResult[];
};

export type ProfessorRepairRoundRecordV2 = {
  round: number;
  invocation: ProfessorInvocationRecordV2;
  issueCount: number;
  repairApplied: boolean;
};

export type ProfessorCaseStatusV2 =
  | "SEALED_SUCCESS"
  | "SEALED_FAILURE"
  | "NORMALIZATION_FAILURE"
  | "PROFESSOR_CONTEXT_UNSATISFIABLE"
  | "RUNTIME_FAILURE";

export type ProfessorCaseExperimentPurposeV2 = "FORMAL_EXPERIMENT" | "HARNESS_SMOKE_ONLY";

export type RuntimeFailureAttemptKindV2 =
  | "INITIAL_PARTIAL_RUN"
  | "CREDIT_RESTORATION_RESUME"
  | "UNKNOWN";

export type RuntimeFailureAttemptRecordV2 = {
  attemptId: string;
  attemptKind: RuntimeFailureAttemptKindV2;
  taskId?: string;
  sealedAt: string;
  error: string;
  failurePhase: "CONTEXT_BUILD" | "PROFESSOR_INVOKE" | "UNKNOWN";
  caseStatus: "RUNTIME_FAILURE";
  artifactSnapshot: Record<string, unknown>;
};

export type ProfessorCaseExperimentRecordV2 = {
  version: typeof PROFESSOR_PLAN_AGENT_V2_VERSION;
  experimentPurpose: ProfessorCaseExperimentPurposeV2;
  caseId: string;
  commanders: string[];
  frozenFactIds: string[];
  frozenOpportunityIds: string[];
  noActionableFactIds: string[];
  ragEvidenceIds: string[];
  professorModelPin: ProfessorModelPinV2;
  professorConfiguration: {
    maxToolCalls: number;
    maxEvidenceChunks: number;
    maxRepairRounds: number;
    experimentPath: "SEMANTIC_ONLY";
    goldBuildPathExcluded: true;
    researchExcluded: true;
  };
  invocations: ProfessorInvocationRecordV2[];
  toolCallTrace: ProfessorToolCallRecordV2[];
  proposedHypotheses: StrategyHypothesis[];
  validationResults: StrategyPackageValidationResult[];
  repairRounds: ProfessorRepairRoundRecordV2[];
  finalValidatedPackages: SemanticPackage[];
  threeLensPortfolios: ThreeLensPortfolioSelection;
  threeLensCollapseUnexplained: boolean;
  caseStatus: ProfessorCaseStatusV2;
  caseAttemptId?: string;
  taskId?: string;
  resumeGeneration?: string;
  priorRuntimeFailureAttempts?: RuntimeFailureAttemptRecordV2[];
  stackFreezeManifestSha256?: string;
  contextPreflightVersion?: typeof PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION;
  contextPreflightIssues?: ProfessorContextPreflightIssue[];
  sealedAt: string;
  goldComparisonStatus: "NOT_RUN_AWAITING_PRE_GOLD_AUDIT";
};

const SYSTEM_PROMPT = PROFESSOR_PLAN_SYSTEM_PROMPT_V2;
const RESPONSES_TOOLS = PROFESSOR_PLAN_RESPONSES_TOOLS_V2;

type ResponsesInputItem = Record<string, unknown>;

type ResponsesApiResult = {
  output: ResponsesInputItem[];
  outputText?: string;
};

function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY required for Professor PLAN experiment v2");
  return key;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function buildUserPrompt(ctx: ProfessorPlanningContext, repairIssues?: StructuredValidationIssue[]): string {
  const factIds = ctx.commanderMechanismFacts.map((f) => f.mechanismId);
  const noActionable = ctx.noActionableFactIds ?? [];
  const oppSummaries = ctx.semanticOpportunities.map((o) => ({
    opportunityId: o.opportunityId,
    type: o.opportunityType,
    recordKind: o.recordKind ?? "OPPORTUNITY",
    causalStatement: o.causalStatement,
    semanticEdge: o.semanticEdge,
    sourceFactIds: o.sourceFactIds,
    confidence: o.opportunityConfidence,
  }));

  const factsCompact = ctx.commanderMechanismFacts.map((f) => ({
    mechanismId: f.mechanismId,
    mechanismType: f.mechanismType,
    evidenceSpan: f.evidenceSpan,
    trigger: f.trigger,
    target: f.target,
    noActionable: noActionable.includes(f.mechanismId),
  }));

  const ragBlock = formatMtgKnowledgeEvidence(ctx.initialRagEvidence);
  const ragIdCatalog = ctx.initialRagEvidence.map((h) => ({
    evidenceId: h.chunkId,
    citationLabel: h.citationLabel,
    corpus: h.corpus,
  }));

  let prompt = [
    `caseId=${ctx.caseId}`,
    `commandZone=${JSON.stringify(ctx.commandZone)}`,
    `colorIdentity=${ctx.colorIdentity.join("")}`,
    `bracket=${ctx.bracket}`,
    `constraints=${JSON.stringify(ctx.userConstraints)}`,
    "",
    "FROZEN mechanismFactIds (cite subset in hypotheses):",
    JSON.stringify(factIds),
    "",
    "NO_ACTIONABLE factIds (context only — cannot alone justify positive packages):",
    JSON.stringify(noActionable),
    "",
    "FROZEN mechanism facts (compact):",
    JSON.stringify(factsCompact, null, 0),
    "",
    "FROZEN semantic opportunities:",
    JSON.stringify(oppSummaries, null, 0),
    "",
    "Initial curated RAG evidence:",
    ragBlock,
    "",
    "RAG evidenceIds (use these exact strings in RAG_EVIDENCE.evidenceIds):",
    JSON.stringify(ragIdCatalog, null, 0),
  ].join("\n");

  if (repairIssues && repairIssues.length > 0) {
    prompt += `\n\nVALIDATOR FEEDBACK — repair these issues and return revised hypotheses JSON:\n${JSON.stringify(repairIssues, null, 2)}`;
  }

  return prompt;
}

type ToolState = {
  toolCalls: ProfessorToolCallRecordV2[];
  evidenceChunkIds: Set<string>;
  toolCallCount: number;
};

async function executeTool(
  ctx: ProfessorPlanningContext,
  name: string,
  args: Record<string, unknown>,
  state: ToolState,
  maxEvidenceChunks: number,
): Promise<string> {
  if (name === "inspectCommanderFacts") {
    const ids = Array.isArray(args.factIds) ? (args.factIds as string[]) : [];
    const facts = ctx.commanderMechanismFacts.filter((f) => ids.length === 0 || ids.includes(f.mechanismId));
    return JSON.stringify(
      facts.slice(0, 20).map((f) => ({
        ...f,
        noActionable: (ctx.noActionableFactIds ?? []).includes(f.mechanismId),
      })),
    );
  }

  if (name === "inspectSemanticOpportunities") {
    const ids = Array.isArray(args.opportunityIds) ? (args.opportunityIds as string[]) : [];
    const opps = ctx.semanticOpportunities.filter((o) => ids.length === 0 || ids.includes(o.opportunityId));
    return JSON.stringify(opps.slice(0, 30));
  }

  if (name === "searchMtgKnowledge") {
    const query = String(args.query ?? ctx.commandZone.commanders.join(" "));
    const mode = String(args.mode ?? "PACKAGE") as MtgKnowledgeRetrievalMode;
    const remaining = maxEvidenceChunks - state.evidenceChunkIds.size;
    if (remaining <= 0) return JSON.stringify({ note: "evidence chunk budget exhausted", hits: [] });

    const result = await searchMtgKnowledge({
      query,
      mode,
      consumer: "professor_planner",
      commanderName: ctx.commandZone.commanders[0],
      limit: Math.min(4, remaining),
    });

    for (const hit of result.hits) {
      state.evidenceChunkIds.add(hit.chunkId);
    }

    return JSON.stringify({
      hits: result.hits.map((h) => ({
        chunkId: h.chunkId,
        corpus: h.corpus,
        citationLabel: h.citationLabel,
        vectorDistance: h.vectorDistance,
        vectorSimilarity: h.vectorSimilarity,
        lexicalBoost: h.lexicalBoost,
        finalScore: h.finalScore,
        retrievalText: h.retrievalText,
      })),
    });
  }

  return JSON.stringify({ error: `Unknown tool ${name}` });
}

function parseHypothesesJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`Professor content is not JSON: ${raw.slice(0, 120)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function extractOutputText(output: ResponsesInputItem[], outputText?: string): string {
  if (outputText && outputText.trim().length > 0) return outputText;
  const chunks: string[] = [];
  for (const item of output) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content as Array<{ type?: string; text?: string }>) {
        if (part.type === "output_text" && part.text) chunks.push(part.text);
        if (part.type === "text" && part.text) chunks.push(part.text);
      }
    }
    if (typeof item.content === "string") chunks.push(item.content);
  }
  return chunks.join("\n").trim();
}

async function openAiResponses(
  apiKey: string,
  modelPin: ProfessorModelPinV2,
  input: ResponsesInputItem[],
  options?: { tools?: boolean; json?: boolean },
): Promise<ResponsesApiResult> {
  const body: Record<string, unknown> = {
    model: modelPin.modelIdentifier,
    input,
    reasoning: {
      effort: modelPin.reasoningConfiguration.effort,
      ...(modelPin.reasoningConfiguration.mode === "pro" ? { mode: "pro" } : {}),
    },
    max_output_tokens: modelPin.inferenceParameters.maxCompletionTokens,
  };
  if (options?.tools) {
    body.tools = RESPONSES_TOOLS;
  }
  if (options?.json) {
    body.text = { format: { type: "json_object" } };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(modelPin.inferenceParameters.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Professor PLAN v2 failed: ${await response.text()}`);
  }

  const data = (await response.json()) as ResponsesApiResult;
  if (!Array.isArray(data.output)) throw new Error("Empty OpenAI Responses output");
  return data;
}

async function callProfessor(args: {
  ctx: ProfessorPlanningContext;
  repairIssues: StructuredValidationIssue[] | undefined;
  state: ToolState;
  maxToolCalls: number;
  maxEvidenceChunks: number;
  modelPin: ProfessorModelPinV2;
  round: number;
  taskId: string;
  validatorCtx: ReturnType<typeof buildValidatorContextV2FromPlanning>;
}): Promise<ProfessorInvocationRecordV2> {
  const apiKey = requireOpenAiKey();
  const attemptId = randomUUID();
  const userPrompt = buildUserPrompt(args.ctx, args.repairIssues);

  let inputList: ResponsesInputItem[] = [
    { role: "developer", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  while (args.state.toolCallCount < args.maxToolCalls) {
    const response = await openAiResponses(apiKey, args.modelPin, inputList, { tools: true });
    inputList = inputList.concat(response.output);

    const functionCalls = response.output.filter((item) => item.type === "function_call");
    if (functionCalls.length === 0) break;

    for (const fc of functionCalls) {
      if (args.state.toolCallCount >= args.maxToolCalls) break;
      args.state.toolCallCount++;
      const name = String(fc.name ?? "");
      const parsedArgs = JSON.parse(String(fc.arguments ?? "{}")) as Record<string, unknown>;
      const result = await executeTool(args.ctx, name, parsedArgs, args.state, args.maxEvidenceChunks);
      args.state.toolCalls.push({
        callIndex: args.state.toolCallCount,
        tool: name,
        arguments: parsedArgs,
        resultSummary: result.slice(0, 300),
        evidenceChunkIds: [...args.state.evidenceChunkIds],
      });
      inputList.push({
        type: "function_call_output",
        call_id: fc.call_id,
        output: result,
      });
    }
  }

  inputList.push({
    role: "user",
    content:
      'Finalize now. Return ONLY valid JSON: {"hypotheses":[...]} with 2-4 StrategyHypothesis objects and 6-12 total SemanticPackages. All required typed evidence fields must be present.',
  });

  const finalResponse = await openAiResponses(apiKey, args.modelPin, inputList, { json: true });
  const rawModelResponse = extractOutputText(finalResponse.output, finalResponse.outputText);
  if (!rawModelResponse) throw new Error("Professor returned no final JSON content");

  const parsedModelResponse = parseHypothesesJson(rawModelResponse);
  const normalization = normalizeProfessorPlanningResponse({
    rawModelResponse,
    parsedModelResponse,
    ctx: args.ctx,
  });

  const validationInput = normalization.normalizedPlanningContract;
  const validationResults =
    validationInput?.map((h) => validateStrategyHypothesisV2(args.validatorCtx, h)) ?? [];

  return {
    taskId: args.taskId,
    attemptId,
    round: args.round,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    systemPromptHash: sha256(SYSTEM_PROMPT),
    userPromptHash: sha256(userPrompt),
    rawModelResponse,
    parsedModelResponse,
    normalization,
    validationInput: validationInput ?? null,
    validationResults,
  };
}

function collectValidatedPackages(
  hypotheses: StrategyHypothesis[],
  results: StrategyPackageValidationResult[],
): SemanticPackage[] {
  const ok = new Set(
    results.filter((r) => r.outcome === "VALIDATED" || r.outcome === "VALID_WITH_CONSTRAINT").map((r) => r.hypothesisId),
  );
  const packages: SemanticPackage[] = [];
  for (const h of hypotheses) {
    if (ok.has(h.hypothesisId)) packages.push(...h.packages);
  }
  return packages;
}

function hasBlockingErrors(results: StrategyPackageValidationResult[]): boolean {
  return results.some(
    (r) =>
      r.outcome === "REJECTED_MECHANICALLY" ||
      r.outcome === "REJECTED_LEGALITY" ||
      r.outcome === "NORMALIZATION_FAILURE" ||
      r.outcome === "PARTIALLY_SUPPORTED" ||
      r.issues.some((i) => i.severity === "ERROR"),
  );
}

export async function runProfessorPlanCaseV2(
  ctx: ProfessorPlanningContext,
  options?: {
    experimentPurpose?: ProfessorCaseExperimentPurposeV2;
    stackFreezeManifestSha256?: string;
  },
): Promise<ProfessorCaseExperimentRecordV2> {
  const preflight = auditProfessorPlanningContextPreflight(ctx);
  if (!preflight.pass) {
    const modelPin = loadProfessorModelPinV2();
    return {
      version: PROFESSOR_PLAN_AGENT_V2_VERSION,
      experimentPurpose: options?.experimentPurpose ?? "FORMAL_EXPERIMENT",
      caseId: ctx.caseId,
      commanders: ctx.commandZone.commanders,
      frozenFactIds: ctx.commanderMechanismFacts.map((f) => f.mechanismId),
      frozenOpportunityIds: ctx.semanticOpportunities.map((o) => o.opportunityId),
      noActionableFactIds: ctx.noActionableFactIds ?? [],
      ragEvidenceIds: ctx.initialRagEvidence.map((h) => h.chunkId),
      professorModelPin: modelPin,
      professorConfiguration: {
        maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
        maxEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
        maxRepairRounds: modelPin.experimentBounds.maxValidationRepairRounds,
        experimentPath: "SEMANTIC_ONLY",
        goldBuildPathExcluded: true,
        researchExcluded: true,
      },
      invocations: [],
      toolCallTrace: [],
      proposedHypotheses: [],
      validationResults: [],
      repairRounds: [],
      finalValidatedPackages: [],
      threeLensPortfolios: {
        caseId: ctx.caseId,
        availablePackageIds: [],
        dependent: [],
        independent: [],
        harmony: [],
        sharedPackageIds: [],
        convergenceMode: "NONE",
        convergenceJustification: preflight.issues.map((i) => i.message).join("; "),
      },
      threeLensSelectorVersion: THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
      synergyGraphVersion: PACKAGE_SYNERGY_GRAPH_V8_VERSION,
      canonicalResourceOntologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION,
      harmonyDetermination: null,
      packageSynergyTypedEdges: [],
      synergyGraphQA: null,
      threeLensPairwiseEquivalences: [],
      threeLensCollapseUnexplained: false,
      caseStatus: "PROFESSOR_CONTEXT_UNSATISFIABLE",
      caseAttemptId: randomUUID(),
      taskId: randomUUID(),
      stackFreezeManifestSha256: options?.stackFreezeManifestSha256,
      contextPreflightVersion: PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION,
      contextPreflightIssues: preflight.issues,
      sealedAt: new Date().toISOString(),
      goldComparisonStatus: "NOT_RUN_AWAITING_PRE_GOLD_AUDIT",
    };
  }

  const modelPin = loadProfessorModelPinV2();
  const maxRepair = modelPin.experimentBounds.maxValidationRepairRounds;
  const caseAttemptId = randomUUID();
  const taskId = randomUUID();

  const ragEvidenceIds = ctx.initialRagEvidence.map((h) => h.chunkId);
  const validatorCtx = buildValidatorContextV2FromPlanning({
    caseId: ctx.caseId,
    colorIdentity: ctx.colorIdentity,
    bracket: ctx.bracket,
    commandZoneConfiguration: ctx.commandZone.configuration,
    commanders: ctx.commandZone.commanders,
    mechanismFacts: ctx.commanderMechanismFacts,
    semanticOpportunities: ctx.semanticOpportunities,
    noActionableFactIds: ctx.noActionableFactIds ?? [],
    knownRagEvidenceIds: ragEvidenceIds,
  });

  const state: ToolState = {
    toolCalls: [],
    evidenceChunkIds: new Set(ragEvidenceIds),
    toolCallCount: 0,
  };

  let hypotheses: StrategyHypothesis[] = [];
  let validationResults: StrategyPackageValidationResult[] = [];
  const invocations: ProfessorInvocationRecordV2[] = [];
  const repairRounds: ProfessorRepairRoundRecordV2[] = [];
  let repairIssues: StructuredValidationIssue[] | undefined;
  let lastNormalizationFailed = false;

  for (let round = 0; round <= maxRepair; round++) {
    const invocation = await callProfessor({
      ctx,
      repairIssues,
      state,
      maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
      maxEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
      modelPin,
      round,
      taskId,
      validatorCtx,
    });

    invocations.push(invocation);
    lastNormalizationFailed = invocation.normalization.status === "NORMALIZATION_FAILURE";
    hypotheses = invocation.validationInput ?? [];
    validationResults = invocation.validationResults;

    const issueCount = validationResults.reduce((n, r) => n + r.issues.length, 0);
    const blocking = lastNormalizationFailed || hasBlockingErrors(validationResults);

    repairRounds.push({
      round,
      invocation,
      issueCount,
      repairApplied: round < maxRepair && blocking,
    });

    if (!blocking || round >= maxRepair) break;

    repairIssues = [
      ...invocation.normalization.issues.map((i) => ({
        issueId: `norm-${i.path}`,
        category: "PRE_VALIDATION_GATE" as const,
        severity: "ERROR" as const,
        hypothesisId: ctx.caseId,
        message: `${i.path}: ${i.message}`,
        fixable: true,
      })),
      ...validationResults.flatMap((r) => r.issues.filter((i) => i.severity === "ERROR" || i.fixable)),
    ];
  }

  const finalValidatedPackages = lastNormalizationFailed ? [] : collectValidatedPackages(hypotheses, validationResults);
  const threeLensSelection = selectThreeLensPortfoliosV5(ctx.caseId, finalValidatedPackages);
  const threeLensPortfolios = {
    caseId: threeLensSelection.caseId,
    availablePackageIds: threeLensSelection.availablePackageIds,
    dependent: threeLensSelection.dependent,
    independent: threeLensSelection.independent,
    harmony: threeLensSelection.harmony,
    sharedPackageIds: threeLensSelection.sharedPackageIds,
    convergenceMode: threeLensSelection.convergenceMode,
    convergenceJustification: threeLensSelection.convergenceJustification,
  };
  const threeLensCollapseUnexplained = hasUnexplainedThreeLensCollapseV5(threeLensSelection);

  let caseStatus: ProfessorCaseStatusV2;
  if (lastNormalizationFailed) {
    caseStatus = "NORMALIZATION_FAILURE";
  } else if (finalValidatedPackages.length === 0) {
    caseStatus = "SEALED_FAILURE";
  } else if (threeLensCollapseUnexplained) {
    caseStatus = "SEALED_FAILURE";
  } else {
    caseStatus = "SEALED_SUCCESS";
  }

  const allRagEvidenceIds = [...new Set([...ragEvidenceIds, ...state.evidenceChunkIds])];

  return {
    version: PROFESSOR_PLAN_AGENT_V2_VERSION,
    experimentPurpose: options?.experimentPurpose ?? "FORMAL_EXPERIMENT",
    caseId: ctx.caseId,
    commanders: ctx.commandZone.commanders,
    frozenFactIds: ctx.commanderMechanismFacts.map((f) => f.mechanismId),
    frozenOpportunityIds: ctx.semanticOpportunities.map((o) => o.opportunityId),
    noActionableFactIds: ctx.noActionableFactIds ?? [],
    ragEvidenceIds: allRagEvidenceIds,
    professorModelPin: modelPin,
    professorConfiguration: {
      maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
      maxEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
      maxRepairRounds: maxRepair,
      experimentPath: "SEMANTIC_ONLY",
      goldBuildPathExcluded: true,
      researchExcluded: true,
    },
    invocations,
    toolCallTrace: state.toolCalls,
    proposedHypotheses: hypotheses,
    validationResults,
    repairRounds,
    finalValidatedPackages: threeLensSelection.enrichedPackages.length
      ? threeLensSelection.enrichedPackages
      : finalValidatedPackages,
    threeLensPortfolios,
    threeLensSelectorVersion: THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
    synergyGraphVersion: PACKAGE_SYNERGY_GRAPH_V8_VERSION,
    canonicalResourceOntologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION,
    harmonyDetermination: threeLensSelection.harmonyDetermination,
    packageSynergyTypedEdges: threeLensSelection.packageSynergyTypedEdges,
    synergyGraphQA: threeLensSelection.synergyGraphQA,
    threeLensPairwiseEquivalences: threeLensSelection.pairwiseEquivalences,
    threeLensCollapseUnexplained,
    caseStatus,
    caseAttemptId,
    taskId,
    stackFreezeManifestSha256: options?.stackFreezeManifestSha256,
    sealedAt: new Date().toISOString(),
    goldComparisonStatus: "NOT_RUN_AWAITING_PRE_GOLD_AUDIT",
  };
}
