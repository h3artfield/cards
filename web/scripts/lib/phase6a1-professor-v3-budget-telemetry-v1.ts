/**
 * Professor v3 prompt/model budget telemetry — record weight without prompt rewrites.
 */
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  commanderPrimerChunkMatchesResolvedCommander,
  resolveCommanderPrimerScopeNames,
} from "../../src/lib/mtg-rag/commander-primer-scope";
import type { ProfessorV3ResponsesApiEnvelopeV1 } from "./phase6a1-professor-v3-model-response-boundary-v1";

export const PROFESSOR_V3_BUDGET_TELEMETRY_V1_VERSION = "phase6a1-professor-v3-budget-telemetry-v1";

export type ProfessorV3BudgetTelemetryV1 = {
  version: typeof PROFESSOR_V3_BUDGET_TELEMETRY_V1_VERSION;
  inputTokens: number | null;
  systemInstructionBytes: number;
  userContentBytes: number;
  ragEvidenceCount: number;
  commanderPrimerCount: number;
  mismatchedCommanderPrimerCount: number;
  duplicateEvidenceCount: number;
  maxOutputTokens: number;
  reasoningTokens: number | null;
  visibleGeneratedTokens: number | null;
};

export function byteLengthUtf8(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function countDuplicateRetrievalEvidenceIds(retrievalEventEvidenceIds: string[][]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const ids of retrievalEventEvidenceIds) {
    for (const id of ids) {
      total += 1;
      seen.add(id);
    }
  }
  return Math.max(0, total - seen.size);
}

export function countMismatchedCommanderPrimers(args: {
  ragEvidence: Array<{ corpus: string; commander?: string }>;
  resolvedCommanderNames: string[];
}): number {
  if (args.resolvedCommanderNames.length === 0) return 0;
  return args.ragEvidence.filter(
    (hit) =>
      hit.corpus === "commander_primer" &&
      !commanderPrimerChunkMatchesResolvedCommander(hit, args.resolvedCommanderNames),
  ).length;
}

export function buildProfessorV3BudgetTelemetryContextFromPlanningContext(
  ctx: ProfessorPlanningContextV3,
): {
  resolvedCommanderNames: string[];
  ragEvidence: Array<{ chunkId: string; corpus: string; commander?: string }>;
  retrievalEventEvidenceIds: string[][];
} {
  return {
    resolvedCommanderNames: ctx.commandZone.commanders,
    ragEvidence: ctx.initialRagEvidence.map((hit) => ({
      chunkId: hit.chunkId,
      corpus: hit.corpus,
      commander: hit.commander,
    })),
    retrievalEventEvidenceIds: (ctx.initialRetrievalAttempts ?? []).map((event) => event.returnedEvidenceIds ?? []),
  };
}

export function computeProfessorV3BudgetTelemetryV1(args: {
  systemInstructions: string;
  userContent: string;
  maxOutputTokens: number;
  resolvedCommanderNames?: string[];
  ragEvidence?: Array<{ chunkId: string; corpus: string; commander?: string }>;
  retrievalEventEvidenceIds?: string[][];
  envelope?: ProfessorV3ResponsesApiEnvelopeV1 | null;
}): ProfessorV3BudgetTelemetryV1 {
  const resolvedCommanderNames = resolveCommanderPrimerScopeNames({
    resolvedCommanderNames: args.resolvedCommanderNames,
  });
  const ragEvidence = args.ragEvidence ?? [];
  const reasoningTokens = args.envelope?.usage?.output_tokens_details?.reasoning_tokens ?? null;
  const outputTokens = args.envelope?.usage?.output_tokens ?? null;
  const visibleGeneratedTokens =
    outputTokens != null && reasoningTokens != null ? Math.max(0, outputTokens - reasoningTokens) : outputTokens;

  return {
    version: PROFESSOR_V3_BUDGET_TELEMETRY_V1_VERSION,
    inputTokens: args.envelope?.usage?.input_tokens ?? null,
    systemInstructionBytes: byteLengthUtf8(args.systemInstructions),
    userContentBytes: byteLengthUtf8(args.userContent),
    ragEvidenceCount: ragEvidence.length,
    commanderPrimerCount: ragEvidence.filter((hit) => hit.corpus === "commander_primer").length,
    mismatchedCommanderPrimerCount: countMismatchedCommanderPrimers({ ragEvidence, resolvedCommanderNames }),
    duplicateEvidenceCount: countDuplicateRetrievalEvidenceIds(args.retrievalEventEvidenceIds ?? []),
    maxOutputTokens: args.maxOutputTokens,
    reasoningTokens,
    visibleGeneratedTokens,
  };
}
