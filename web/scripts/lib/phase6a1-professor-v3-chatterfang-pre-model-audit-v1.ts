/**
 * Pre-model audit for Chatterfang prospective stack — real RAG context + request body + provenance checks.
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
} from "./phase6a1-professor-v3-budget-telemetry-v1";
import { verifyProfessorV3RunLedgerContextProvenanceV1 } from "./phase6a1-professor-v3-post-zada-tool-loop-replay-v1";
import { buildProfessorV3PromptPayload } from "./phase6a1-professor-v3-prompt-payload-v1";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";
import { initRunLedgerFromContext } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";

export const PROFESSOR_V3_CHATTERFANG_PRE_MODEL_AUDIT_V1_VERSION = "phase6a1-professor-v3-chatterfang-pre-model-audit-v1";

export const PROFESSOR_V3_CHATTERFANG_PRE_MODEL_AUDIT_CASE_BINDING_V1 = {
  caseId: "professor-v3-smoke-chatterfang-prospective-v1",
  mechanismTruthCaseId: "multi-chatterfang",
  commanderName: "Chatterfang, Squirrel General",
} as const;

export type ProfessorV3ChatterfangPreModelAuditCheckV1 = {
  id: string;
  description: string;
  pass: boolean;
  detail?: string;
};

export type ProfessorV3ChatterfangPreModelAuditResultV1 = {
  version: typeof PROFESSOR_V3_CHATTERFANG_PRE_MODEL_AUDIT_V1_VERSION;
  generatedAt: string;
  caseId: string;
  mechanismTruthCaseId: string;
  totalChecks: number;
  passed: number;
  failed: number;
  checks: ProfessorV3ChatterfangPreModelAuditCheckV1[];
};

function record(
  checks: ProfessorV3ChatterfangPreModelAuditCheckV1[],
  id: string,
  description: string,
  pass: boolean,
  detail?: string,
) {
  checks.push({ id, description, pass, detail });
}

export async function runProfessorV3ChatterfangPreModelAuditV1(args?: {
  caseId?: string;
  mechanismTruthCaseId?: string;
}): Promise<ProfessorV3ChatterfangPreModelAuditResultV1> {
  const checks: ProfessorV3ChatterfangPreModelAuditCheckV1[] = [];
  const caseId = args?.caseId ?? PROFESSOR_V3_CHATTERFANG_PRE_MODEL_AUDIT_CASE_BINDING_V1.caseId;
  const mechanismTruthCaseId =
    args?.mechanismTruthCaseId ?? PROFESSOR_V3_CHATTERFANG_PRE_MODEL_AUDIT_CASE_BINDING_V1.mechanismTruthCaseId;
  const commanderNeedle = "Chatterfang";

  const entry = getPilotMechanismCatalogEntry(mechanismTruthCaseId);
  if (!entry) throw new Error(`Missing mechanism truth for ${mechanismTruthCaseId}`);

  const ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = caseId;
  const runLedger = initRunLedgerFromContext(ctx);

  const telemetryContext = buildProfessorV3BudgetTelemetryContextFromPlanningContext(ctx);
  const commanderPrimerHits = ctx.initialRagEvidence.filter((hit) => hit.corpus === "commander_primer");
  const foreignCommanderPrimers = commanderPrimerHits.filter((hit) => !hit.commander?.includes(commanderNeedle));
  const packageRetrievalIds = new Set(
    (ctx.initialRetrievalAttempts ?? [])
      .filter((event) => event.retrievalMode === "PACKAGE")
      .flatMap((event) => event.returnedEvidenceIds ?? []),
  );
  const packageForeignPrimers = ctx.initialRagEvidence.filter(
    (hit) => packageRetrievalIds.has(hit.chunkId) && hit.corpus === "commander_primer" && !hit.commander?.includes(commanderNeedle),
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
    "commander-primer-mismatch-zero",
    "COMMANDER_PRIMER retrieval has mismatchedCommanderPrimerCount=0",
    telemetry.mismatchedCommanderPrimerCount === 0,
    `mismatchedCommanderPrimerCount=${telemetry.mismatchedCommanderPrimerCount}; commanderPrimerCount=${telemetry.commanderPrimerCount}`,
  );

  record(
    checks,
    "package-no-foreign-commander-primer",
    "Actual RAG contains 0 foreign commander_primer chunks",
    packageForeignPrimers.length === 0 && foreignCommanderPrimers.length === 0,
    `foreignPrimersInPackage=${packageForeignPrimers.length}; foreignCommanderPrimers=${foreignCommanderPrimers.length}; totalCommanderPrimers=${commanderPrimerHits.length}`,
  );

  const provenance = verifyProfessorV3RunLedgerContextProvenanceV1({ runLedger, ctx });
  record(
    checks,
    "ledger-context-retrieval-mode-provenance",
    "Every retrieved evidence context mode equals originating run-ledger retrievalMode",
    provenance.pass,
    provenance.pass
      ? `checked=${ctx.initialRagEvidence.filter((h) => runLedger.retrievalEvents.some((e) => e.returnedEvidenceIds.includes(h.chunkId))).length}`
      : provenance.mismatches
          .slice(0, 3)
          .map((m) => `${m.evidenceId}:${m.ledgerMode}!=${m.contextMode}`)
          .join("; "),
  );

  const modelPin = loadProfessorModelPinV2();
  const promptPayload = buildProfessorV3PromptPayload(ctx);
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
    "max-output-tokens-32768",
    "Actual built request body has max_output_tokens=32768",
    modelPin.inferenceParameters.maxCompletionTokens === 32768 && requestBody.max_output_tokens === 32768,
    `pin=${modelPin.inferenceParameters.maxCompletionTokens}; body=${requestBody.max_output_tokens}`,
  );

  const passed = checks.filter((c) => c.pass).length;
  return {
    version: PROFESSOR_V3_CHATTERFANG_PRE_MODEL_AUDIT_V1_VERSION,
    generatedAt: new Date().toISOString(),
    caseId,
    mechanismTruthCaseId,
    totalChecks: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
  };
}
