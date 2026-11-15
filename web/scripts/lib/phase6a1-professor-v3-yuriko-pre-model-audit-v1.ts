/**
 * Pre-model audit for Yuriko prospective stack — real RAG context + request body checks.
 */
import { buildProfessorPlanningContextV3 } from "./phase6a1-professor-plan-context-builder-v3";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import {
  buildProfessorV3ApiRequestBodyV4,
  buildProfessorV3ModelUserContentV4,
} from "./phase6a1-professor-v3-model-caller-v4";
import {
  buildProfessorV3BudgetTelemetryContextFromPlanningContext,
  computeProfessorV3BudgetTelemetryV1,
  countDuplicateRetrievalEvidenceIds,
} from "./phase6a1-professor-v3-budget-telemetry-v1";
import { buildProfessorV3PromptPayload } from "./phase6a1-professor-v3-prompt-payload-v1";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";

export const PROFESSOR_V3_YURIKO_PRE_MODEL_AUDIT_V1_VERSION = "phase6a1-professor-v3-yuriko-pre-model-audit-v1";

export const PROFESSOR_V3_YURIKO_PRE_MODEL_AUDIT_CASE_BINDING_V1 = {
  caseId: "professor-v3-smoke-yuriko-prospective-v1",
  mechanismTruthCaseId: "multi-yuriko",
  commanderName: "Yuriko, the Tiger's Shadow",
} as const;

export type ProfessorV3YurikoPreModelAuditCheckV1 = {
  id: string;
  description: string;
  pass: boolean;
  detail?: string;
};

export type ProfessorV3YurikoPreModelAuditResultV1 = {
  version: typeof PROFESSOR_V3_YURIKO_PRE_MODEL_AUDIT_V1_VERSION;
  generatedAt: string;
  caseId: string;
  mechanismTruthCaseId: string;
  totalChecks: number;
  passed: number;
  failed: number;
  checks: ProfessorV3YurikoPreModelAuditCheckV1[];
  contextSummary?: {
    ragEvidenceCount: number;
    commanderPrimerCount: number;
    mismatchedCommanderPrimerCount: number;
    duplicateEvidenceCount: number;
    uniqueEvidenceBodies: number;
    totalEvidenceBodies: number;
  };
  requestSummary?: {
    maxOutputTokens: number | null;
    systemInstructionBytes: number;
    userContentBytes: number;
  };
};

function record(
  checks: ProfessorV3YurikoPreModelAuditCheckV1[],
  id: string,
  description: string,
  pass: boolean,
  detail?: string,
) {
  checks.push({ id, description, pass, detail });
}

export async function runProfessorV3YurikoPreModelAuditV1(args?: {
  caseId?: string;
  mechanismTruthCaseId?: string;
}): Promise<ProfessorV3YurikoPreModelAuditResultV1> {
  const checks: ProfessorV3YurikoPreModelAuditCheckV1[] = [];
  const caseId = args?.caseId ?? PROFESSOR_V3_YURIKO_PRE_MODEL_AUDIT_CASE_BINDING_V1.caseId;
  const mechanismTruthCaseId =
    args?.mechanismTruthCaseId ?? PROFESSOR_V3_YURIKO_PRE_MODEL_AUDIT_CASE_BINDING_V1.mechanismTruthCaseId;

  const entry = getPilotMechanismCatalogEntry(mechanismTruthCaseId);
  if (!entry) throw new Error(`Missing Yuriko mechanism truth for ${mechanismTruthCaseId}`);

  const ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = caseId;

  const telemetryContext = buildProfessorV3BudgetTelemetryContextFromPlanningContext(ctx);
  const commanderPrimerHits = ctx.initialRagEvidence.filter((hit) => hit.corpus === "commander_primer");
  const foreignCommanderPrimers = commanderPrimerHits.filter(
    (hit) => !hit.commander?.includes("Yuriko"),
  );
  const packageRetrievalIds = new Set(
    (ctx.initialRetrievalAttempts ?? [])
      .filter((event) => event.retrievalMode === "PACKAGE")
      .flatMap((event) => event.returnedEvidenceIds ?? []),
  );
  const packageForeignPrimers = ctx.initialRagEvidence.filter(
    (hit) => packageRetrievalIds.has(hit.chunkId) && hit.corpus === "commander_primer" && !hit.commander?.includes("Yuriko"),
  );

  const telemetry = computeProfessorV3BudgetTelemetryV1({
    systemInstructions: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
    userContent: "placeholder",
    maxOutputTokens: loadProfessorModelPinV2().inferenceParameters.maxCompletionTokens,
    resolvedCommanderNames: telemetryContext.resolvedCommanderNames,
    ragEvidence: telemetryContext.ragEvidence,
    retrievalEventEvidenceIds: telemetryContext.retrievalEventEvidenceIds,
  });

  record(
    checks,
    "yuriko-commander-primer-mismatch-zero",
    "COMMANDER_PRIMER retrieval has mismatchedCommanderPrimerCount=0 for Yuriko",
    telemetry.mismatchedCommanderPrimerCount === 0,
    `mismatchedCommanderPrimerCount=${telemetry.mismatchedCommanderPrimerCount}; commanderPrimerCount=${telemetry.commanderPrimerCount}`,
  );

  record(
    checks,
    "yuriko-package-no-foreign-commander-primer",
    "PACKAGE retrieval evidence contains no foreign commander_primer chunks",
    packageForeignPrimers.length === 0 && foreignCommanderPrimers.length === 0,
    `foreignPrimersInPackage=${packageForeignPrimers.length}; foreignCommanderPrimers=${foreignCommanderPrimers.length}; totalCommanderPrimers=${commanderPrimerHits.length}`,
  );

  const chunkIds = ctx.initialRagEvidence.map((hit) => hit.chunkId);
  const uniqueChunkIds = new Set(chunkIds);
  const expectedDuplicateCount = countDuplicateRetrievalEvidenceIds(telemetryContext.retrievalEventEvidenceIds);
  record(
    checks,
    "yuriko-duplicate-evidence-count",
    "Duplicate evidence across retrieval events is counted and deduplicated in context",
    telemetry.duplicateEvidenceCount === expectedDuplicateCount && uniqueChunkIds.size === chunkIds.length,
    `duplicateEvidenceCount=${telemetry.duplicateEvidenceCount}; expected=${expectedDuplicateCount}; uniqueChunkIds=${uniqueChunkIds.size}; totalChunkIds=${chunkIds.length}`,
  );

  const promptPayload = buildProfessorV3PromptPayload(ctx);
  const duplicateBodiesInPrompt = promptPayload.modelVisibleText
    .split("\n")
    .filter((line) => line.includes("[RAG_EVIDENCE"))
    .map((line) => line.trim());
  const uniquePromptBodies = new Set(duplicateBodiesInPrompt);
  record(
    checks,
    "yuriko-no-duplicate-evidence-bodies-in-prompt",
    "Prompt payload contains no duplicate evidence bodies",
    duplicateBodiesInPrompt.length === uniquePromptBodies.size,
    `promptEvidenceLines=${duplicateBodiesInPrompt.length}; unique=${uniquePromptBodies.size}`,
  );

  const modelPin = loadProfessorModelPinV2();
  const userContent = buildProfessorV3ModelUserContentV4({
    attemptIndex: 0,
    systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
    userPayload: promptPayload,
    afterToolResults: false,
  });
  const requestBody = JSON.parse(
    buildProfessorV3ApiRequestBodyV4(modelPin, PROFESSOR_PLAN_SYSTEM_PROMPT_V3, userContent),
  ) as { max_output_tokens?: number };

  record(
    checks,
    "yuriko-max-output-tokens-32768",
    "Actual API request JSON has max_output_tokens=32768",
    modelPin.inferenceParameters.maxCompletionTokens === 32768 && requestBody.max_output_tokens === 32768,
    `pin=${modelPin.inferenceParameters.maxCompletionTokens}; body=${requestBody.max_output_tokens}`,
  );

  const requestTelemetry = computeProfessorV3BudgetTelemetryV1({
    systemInstructions: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
    userContent,
    maxOutputTokens: modelPin.inferenceParameters.maxCompletionTokens,
    resolvedCommanderNames: telemetryContext.resolvedCommanderNames,
    ragEvidence: telemetryContext.ragEvidence,
    retrievalEventEvidenceIds: telemetryContext.retrievalEventEvidenceIds,
  });

  record(
    checks,
    "yuriko-request-telemetry-populated",
    "Budget telemetry for actual request has non-zero user content bytes",
    requestTelemetry.userContentBytes > 0 && requestTelemetry.systemInstructionBytes > 0,
    JSON.stringify({
      systemInstructionBytes: requestTelemetry.systemInstructionBytes,
      userContentBytes: requestTelemetry.userContentBytes,
    }),
  );

  const passed = checks.filter((c) => c.pass).length;
  return {
    version: PROFESSOR_V3_YURIKO_PRE_MODEL_AUDIT_V1_VERSION,
    generatedAt: new Date().toISOString(),
    caseId,
    mechanismTruthCaseId,
    totalChecks: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
    contextSummary: {
      ragEvidenceCount: telemetry.ragEvidenceCount,
      commanderPrimerCount: telemetry.commanderPrimerCount,
      mismatchedCommanderPrimerCount: telemetry.mismatchedCommanderPrimerCount,
      duplicateEvidenceCount: telemetry.duplicateEvidenceCount,
      uniqueChunkIds: uniqueChunkIds.size,
      totalChunkIds: chunkIds.length,
    },
    requestSummary: {
      maxOutputTokens: requestBody.max_output_tokens ?? null,
      systemInstructionBytes: requestTelemetry.systemInstructionBytes,
      userContentBytes: requestTelemetry.userContentBytes,
    },
  };
}
