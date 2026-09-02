/**
 * Professor v3 run ledger — evidence objects separate from append-only retrieval events.
 */
import { createHash } from "node:crypto";
import type { MtgKnowledgeEvidence } from "../deck-intelligence/mtg-knowledge-service";
import type { ProfessorEvidenceLedgerEntryV3 } from "./professor-v3-evidence-ledger-v1";
import { buildProfessorEvidenceLedgerV3, sha256Text } from "./professor-v3-evidence-ledger-v1";

export const PROFESSOR_V3_RUN_LEDGER_V1_VERSION = "professor-v3-run-ledger-v1";

export type ProfessorEvidenceObjectV3 = {
  evidenceId: string;
  kind: ProfessorEvidenceLedgerEntryV3["kind"];
  source: string;
  sourceVersion?: string;
  citationLabel?: string;
  exactText: string;
  contentSha256: string;
};

export type ProfessorRetrievalEventV3 = {
  eventIndex: number;
  tool: string;
  query: string;
  retrievalMode?: string;
  resultCount: number;
  status: "SUCCESS" | "EMPTY" | "DISABLED" | "ERROR";
  error?: string | null;
  sourceEnvironmentIdentity?: string;
  returnedEvidenceIds: string[];
  ledgerSha256After: string;
};

export type ProfessorRunLedgerV3 = {
  version: typeof PROFESSOR_V3_RUN_LEDGER_V1_VERSION;
  caseId: string;
  evidenceObjects: ProfessorEvidenceObjectV3[];
  retrievalEvents: ProfessorRetrievalEventV3[];
};

function objectFromEntry(entry: ProfessorEvidenceLedgerEntryV3): ProfessorEvidenceObjectV3 {
  return {
    evidenceId: entry.evidenceId,
    kind: entry.kind,
    source: entry.source,
    sourceVersion: entry.sourceVersion,
    citationLabel: entry.citationLabel,
    exactText: entry.exactText,
    contentSha256: entry.contentSha256,
  };
}

export function mergeEvidenceObjectAppendOnly(
  objects: ProfessorEvidenceObjectV3[],
  incoming: ProfessorEvidenceObjectV3,
): ProfessorEvidenceObjectV3[] {
  if (objects.some((o) => o.evidenceId === incoming.evidenceId)) return objects;
  return [...objects, incoming];
}

export function initRunLedgerFromContext(ctx: ProfessorPlanningContextV3): ProfessorRunLedgerV3 {
  const legacy = buildProfessorEvidenceLedgerV3(ctx);
  let evidenceObjects: ProfessorEvidenceObjectV3[] = [];
  for (const entry of legacy.entries) {
    evidenceObjects = mergeEvidenceObjectAppendOnly(evidenceObjects, objectFromEntry(entry));
  }
  return seedInitialRetrievalEventsFromContext(
    { version: PROFESSOR_V3_RUN_LEDGER_V1_VERSION, caseId: ctx.caseId, evidenceObjects, retrievalEvents: [] },
    ctx,
  );
}

/** Record initial context-builder retrieval events — exactly one event per initialRetrievalAttempt. */
export function seedInitialRetrievalEventsFromContext(
  runLedger: ProfessorRunLedgerV3,
  ctx: ProfessorPlanningContextV3,
): ProfessorRunLedgerV3 {
  let ledger = runLedger;
  for (const attempt of ctx.initialRetrievalAttempts ?? []) {
    ledger = appendRetrievalEvent({
      runLedger: ledger,
      hits: [],
      tool: attempt.tool,
      query: attempt.query,
      retrievalMode: attempt.retrievalMode,
      resultCount: attempt.resultCount,
      status: attempt.status,
      error: attempt.error ?? null,
      sourceEnvironmentIdentity: attempt.sourceEnvironmentIdentity,
      returnedEvidenceIds: attempt.returnedEvidenceIds,
    });
  }
  return ledger;
}

export function appendRetrievalEvent(args: {
  runLedger: ProfessorRunLedgerV3;
  hits: MtgKnowledgeEvidence[];
  tool: string;
  query: string;
  retrievalMode?: string;
  resultCount?: number;
  status?: ProfessorRetrievalEventV3["status"];
  error?: string | null;
  sourceEnvironmentIdentity?: string;
  returnedEvidenceIds?: string[];
}): ProfessorRunLedgerV3 {
  let evidenceObjects = args.runLedger.evidenceObjects;
  const returnedEvidenceIds: string[] = [];
  const seenEvidenceIds = new Set<string>();
  for (const evidenceId of args.returnedEvidenceIds ?? []) {
    if (seenEvidenceIds.has(evidenceId)) continue;
    seenEvidenceIds.add(evidenceId);
    returnedEvidenceIds.push(evidenceId);
  }
  for (const hit of args.hits) {
    const obj: ProfessorEvidenceObjectV3 = {
      evidenceId: hit.chunkId,
      kind: hit.corpus === "comprehensive_rules" ? "RULES" : "RAG",
      source: hit.corpus,
      citationLabel: hit.citationLabel,
      exactText: hit.retrievalText,
      contentSha256: sha256Text(hit.retrievalText),
    };
    evidenceObjects = mergeEvidenceObjectAppendOnly(evidenceObjects, obj);
    if (!seenEvidenceIds.has(hit.chunkId)) {
      seenEvidenceIds.add(hit.chunkId);
      returnedEvidenceIds.push(hit.chunkId);
    }
  }
  const nextObjectsLedger = { ...args.runLedger, evidenceObjects };
  const event: ProfessorRetrievalEventV3 = {
    eventIndex: args.runLedger.retrievalEvents.length,
    tool: args.tool,
    query: args.query,
    retrievalMode: args.retrievalMode,
    resultCount: args.resultCount ?? args.hits.length,
    status: args.status ?? (args.hits.length > 0 ? "SUCCESS" : "EMPTY"),
    error: args.error ?? null,
    sourceEnvironmentIdentity: args.sourceEnvironmentIdentity,
    returnedEvidenceIds,
    ledgerSha256After: sha256Text(JSON.stringify(nextObjectsLedger)),
  };
  return { ...nextObjectsLedger, retrievalEvents: [...args.runLedger.retrievalEvents, event] };
}

export function runLedgerToPlanningSupplement(runLedger: ProfessorRunLedgerV3): ProfessorEvidenceLedgerEntryV3[] {
  const latestEventByEvidence = new Map<string, ProfessorRetrievalEventV3>();
  for (const event of runLedger.retrievalEvents) {
    for (const evidenceId of event.returnedEvidenceIds) latestEventByEvidence.set(evidenceId, event);
  }
  return runLedger.evidenceObjects.map((obj) => {
    const event = latestEventByEvidence.get(obj.evidenceId);
    return {
      evidenceId: obj.evidenceId,
      kind: obj.kind,
      tool: event?.tool,
      query: event?.query,
      retrievalMode: event?.retrievalMode,
      source: obj.source,
      sourceVersion: obj.sourceVersion,
      citationLabel: obj.citationLabel,
      exactText: obj.exactText,
      contentSha256: obj.contentSha256,
    };
  });
}

export function syncContextFromRunLedger(ctx: ProfessorPlanningContextV3, runLedger: ProfessorRunLedgerV3): ProfessorPlanningContextV3 {
  const latestEventByEvidence = new Map<string, ProfessorRetrievalEventV3>();
  for (const event of runLedger.retrievalEvents) {
    for (const evidenceId of event.returnedEvidenceIds) latestEventByEvidence.set(evidenceId, event);
  }
  const ragHits = runLedger.evidenceObjects
    .filter((o) => o.kind === "RAG" || o.kind === "RULES")
    .map((o) => {
      const event = latestEventByEvidence.get(o.evidenceId);
      const mode =
        o.kind === "RULES"
          ? ("RULES" as const)
          : ((event?.retrievalMode as MtgKnowledgeEvidence["mode"]) ?? ("PACKAGE" as const));
      return {
        chunkId: o.evidenceId,
        citationLabel: o.citationLabel ?? o.evidenceId,
        corpus: o.source as MtgKnowledgeEvidence["corpus"],
        authorityTier: "fixture",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: o.exactText,
        mode,
      } satisfies MtgKnowledgeEvidence;
    });
  return {
    ...ctx,
    initialRagEvidence: ragHits,
    evidenceLedgerSupplement: runLedgerToPlanningSupplement(runLedger),
  };
}

export function runLedgerSha256(runLedger: ProfessorRunLedgerV3): string {
  return sha256Text(JSON.stringify(runLedger));
}

export function legacyLedgerFromRunLedger(runLedger: ProfessorRunLedgerV3): ProfessorEvidenceLedgerV3 {
  return {
    version: "professor-v3-evidence-ledger-v1",
    caseId: runLedger.caseId,
    entries: runLedgerToPlanningSupplement(runLedger).concat(
      runLedger.evidenceObjects
        .filter((o) => o.kind !== "RAG" && o.kind !== "RULES")
        .map((o) => ({
          evidenceId: o.evidenceId,
          kind: o.kind,
          source: o.source,
          sourceVersion: o.sourceVersion,
          citationLabel: o.citationLabel,
          exactText: o.exactText,
          contentSha256: o.contentSha256,
        })),
    ),
  };
}
