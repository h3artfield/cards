/**
 * Offline replay of spent Zada attempt-000 TOOL_REQUESTS through production tool execution.
 */
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import {
  commanderPrimerChunkMatchesResolvedCommander,
  resolveCommanderPrimerScopeNames,
} from "../../src/lib/mtg-rag/commander-primer-scope";
import {
  countDuplicateRetrievalEvidenceIds,
  countMismatchedCommanderPrimers,
} from "./phase6a1-professor-v3-budget-telemetry-v1";
import {
  executeProfessorV3ToolCall,
  validateProfessorV3ToolRequest,
  type ProfessorV3ToolRequest,
} from "./phase6a1-professor-plan-agent-v3";
import { buildProfessorV3PromptPayload } from "./phase6a1-professor-v3-prompt-payload-v1";
import { buildProfessorPlanningContextV3 } from "./phase6a1-professor-plan-context-builder-v3";
import { initRunLedgerFromContext } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import {
  loadProfessorV3ZadaSpentAttempt000ParsedResponseV1,
  type ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1,
} from "./phase6a1-professor-v3-zada-spent-tool-loop-fixture-v1";

export const PROFESSOR_V3_POST_ZADA_TOOL_LOOP_REPLAY_V1_VERSION =
  "phase6a1-professor-v3-post-zada-tool-loop-replay-v1";

export type ProfessorV3PostZadaToolLoopReplayResultV1 = {
  version: typeof PROFESSOR_V3_POST_ZADA_TOOL_LOOP_REPLAY_V1_VERSION;
  frozenEnvelope: ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1;
  toolRequestCount: number;
  completedToolCallCount: number;
  modesExecuted: string[];
  commanderPrimerCount: number;
  mismatchedCommanderPrimerCount: number;
  foreignCommanderPrimerCount: number;
  rulesEvidenceCount: number;
  duplicateRetrievalEvidenceCount: number;
  postToolUserContentBytes: number;
  postToolUserContentIncludesToolResults: boolean;
  retrievalEventCount: number;
  runLedger: ProfessorRunLedgerV3;
  ctx: ProfessorPlanningContextV3;
  provenancePass: boolean;
  provenanceMismatchCount: number;
  provenanceMismatches: Array<{ evidenceId: string; ledgerMode: string; contextMode: string }>;
};

function countRetrievedChunks(toolCalls: Array<{ evidenceIds: string[] }>): number {
  return toolCalls.reduce((n, t) => n + t.evidenceIds.length, 0);
}

export function verifyProfessorV3RunLedgerContextProvenanceV1(args: {
  runLedger: ProfessorRunLedgerV3;
  ctx: ProfessorPlanningContextV3;
}): {
  pass: boolean;
  mismatches: Array<{ evidenceId: string; ledgerMode: string; contextMode: string }>;
} {
  const latestEventByEvidence = new Map<string, string>();
  for (const event of args.runLedger.retrievalEvents) {
    if (!event.retrievalMode) continue;
    for (const evidenceId of event.returnedEvidenceIds) {
      latestEventByEvidence.set(evidenceId, event.retrievalMode);
    }
  }
  const mismatches: Array<{ evidenceId: string; ledgerMode: string; contextMode: string }> = [];
  for (const hit of args.ctx.initialRagEvidence) {
    const ledgerMode = latestEventByEvidence.get(hit.chunkId);
    if (!ledgerMode) continue;
    const contextMode = hit.mode ?? "MISSING";
    if (contextMode !== ledgerMode) {
      mismatches.push({ evidenceId: hit.chunkId, ledgerMode, contextMode });
    }
  }
  return { pass: mismatches.length === 0, mismatches };
}

export async function buildProfessorV3ZadaSpentToolLoopReplayContextV1(): Promise<{
  ctx: ProfessorPlanningContextV3;
  runLedger: ProfessorRunLedgerV3;
}> {
  const entry = getPilotMechanismCatalogEntry("multi-zada");
  if (!entry) throw new Error("Missing multi-zada mechanism truth");
  const ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = "professor-v3-smoke-zada-prospective-v1";
  const runLedger = initRunLedgerFromContext(ctx);
  return { ctx, runLedger };
}

export async function replayProfessorV3ZadaSpentToolLoopOfflineV1(): Promise<ProfessorV3PostZadaToolLoopReplayResultV1> {
  const frozenEnvelope = loadProfessorV3ZadaSpentAttempt000ParsedResponseV1();
  const toolRequests = [...frozenEnvelope.toolRequests];
  const modelPin = loadProfessorModelPinV2();
  const toolBudget = {
    ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3,
    maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
    maxRetrievedEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
  };

  let { ctx, runLedger } = await buildProfessorV3ZadaSpentToolLoopReplayContextV1();
  const completedRecords: Array<{ evidenceIds: string[]; retrievalMode?: string }> = [];
  const modesExecuted: string[] = [];

  for (let callIndex = 0; callIndex < toolRequests.length; callIndex += 1) {
    const req = toolRequests[callIndex] as ProfessorV3ToolRequest;
    const validation = validateProfessorV3ToolRequest({
      req,
      budget: toolBudget,
      toolCallsSoFar: completedRecords.length,
      chunksRetrievedSoFar: countRetrievedChunks(completedRecords),
    });
    if (!validation.ok) {
      throw new Error(`Frozen tool request ${callIndex} failed validation: ${validation.reason}`);
    }
    const executed = await executeProfessorV3ToolCall({
      ctx,
      runLedger,
      callIndex,
      tool: req.tool,
      query: req.query,
      mode: req.mode,
      commanderName: req.commanderName,
      limit: validation.cappedLimit,
    });
    ctx = executed.ctx;
    runLedger = executed.runLedger;
    completedRecords.push(executed.record);
    modesExecuted.push(req.mode);
  }

  const resolvedCommanderNames = resolveCommanderPrimerScopeNames({
    resolvedCommanderNames: ctx.commandZone.commanders,
  });
  const ragEvidence = ctx.initialRagEvidence.map((hit) => ({
    chunkId: hit.chunkId,
    corpus: hit.corpus,
    commander: hit.commander,
  }));
  const retrievalEventEvidenceIds = (ctx.initialRetrievalAttempts ?? []).map((event) => event.returnedEvidenceIds ?? []);
  for (const event of runLedger.retrievalEvents) {
    retrievalEventEvidenceIds.push(event.returnedEvidenceIds ?? []);
  }

  const commanderPrimerHits = ragEvidence.filter((hit) => hit.corpus === "commander_primer");
  const foreignCommanderPrimers = commanderPrimerHits.filter(
    (hit) => !commanderPrimerChunkMatchesResolvedCommander(hit, resolvedCommanderNames),
  );
  const postToolPayload = buildProfessorV3PromptPayload(ctx);
  const postToolUserContent = postToolPayload.modelVisibleText;
  const provenance = verifyProfessorV3RunLedgerContextProvenanceV1({ runLedger, ctx });

  return {
    version: PROFESSOR_V3_POST_ZADA_TOOL_LOOP_REPLAY_V1_VERSION,
    frozenEnvelope,
    toolRequestCount: toolRequests.length,
    completedToolCallCount: completedRecords.length,
    modesExecuted,
    commanderPrimerCount: commanderPrimerHits.length,
    mismatchedCommanderPrimerCount: countMismatchedCommanderPrimers({ ragEvidence, resolvedCommanderNames }),
    foreignCommanderPrimerCount: foreignCommanderPrimers.length,
    rulesEvidenceCount: runLedger.evidenceObjects.filter((obj) => obj.kind === "RULES").length,
    duplicateRetrievalEvidenceCount: countDuplicateRetrievalEvidenceIds(retrievalEventEvidenceIds),
    postToolUserContentBytes: Buffer.byteLength(postToolUserContent, "utf8"),
    postToolUserContentIncludesToolResults: postToolPayload.modelVisibleText.includes("searchMtgKnowledge"),
    retrievalEventCount: runLedger.retrievalEvents.length,
    runLedger,
    ctx,
    provenancePass: provenance.pass,
    provenanceMismatchCount: provenance.mismatches.length,
    provenanceMismatches: provenance.mismatches,
  };
}
