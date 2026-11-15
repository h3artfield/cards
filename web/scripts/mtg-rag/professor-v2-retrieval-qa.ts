#!/usr/bin/env npx tsx
/**
 * SPENT DEV diagnostic — re-run sealed Professor v2 45-query retrieval QA.
 * Policy: phase6a1-mtg-rag-professor-v2-retrieval-dev-spent-manifest-v1.json
 * Use mtg-rag-prospective-holdout-qa.ts for prospective evaluation instead.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { FieldPath } from "firebase-admin/firestore";
import { loadProjectEnvLocal } from "../lib/script-env";
import { getProjectId, requireFirestore } from "../../src/lib/firebase/admin";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import {
  MTG_KNOWLEDGE_SERVICE_VERSION,
  searchMtgKnowledge,
  type MtgKnowledgeRetrievalMode,
} from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import { corporaForRetrievalMode } from "../../src/lib/mtg-rag/corpora-for-mode";
import { rawVectorSearchMtgChunks } from "../../src/lib/mtg-rag/chunk-retrieval";
import { hybridRetrieveMtgKnowledge } from "../../src/lib/mtg-rag/hybrid-retrieval";
import { MTG_RAG_RETRIEVAL_RANKING_VERSION } from "../../src/lib/mtg-rag/retrieval-ranking";
import { MTG_RAG_TRANSCRIPT_FILES } from "../../src/lib/mtg-rag/source-definitions";
import type { MtgQueryIntent } from "../../src/lib/mtg-rag/types";

const DEV_SPENT_MANIFEST = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-professor-v2-retrieval-dev-spent-manifest-v1.json",
);

const CASES_DIR = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v2/cases",
);
const OUT_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-professor-v2-retrieval-qa-v2.json",
);
const PRIOR_QA_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-professor-v2-retrieval-qa-v1.json",
);
const VECTOR_REPAIR_FREEZE_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-vector-repair-freeze-v1.json",
);
const PRIOR_ADJUDICATION_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-professor-v2-retrieval-semantic-adjudication-gpt56sol-v1.json",
);

const MODE_INTENT: Record<MtgKnowledgeRetrievalMode, MtgQueryIntent> = {
  RULES: "rules_question",
  TERMINOLOGY: "terminology_question",
  STRATEGY: "deckbuilding_education",
  COMMANDER_PRIMER: "commander_strategy",
  PACKAGE: "deckbuilding_education",
  INTERACTION: "mixed",
};

const STRATEGY_QUERY_INDICES = [5, 15, 26, 36, 41, 44];

type SealedQuery = {
  queryIndex: number;
  caseId: string;
  callIndex: number;
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  commanderName?: string;
  priorResultSummary?: string;
};

function enrichQuery(input: {
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  commanderName?: string;
}): string {
  const parts = [input.query.trim()];
  if (input.commanderName && input.mode === "COMMANDER_PRIMER") {
    parts.unshift(input.commanderName);
  }
  if (input.mode === "PACKAGE") parts.push("package synergy enabler payoff");
  if (input.mode === "INTERACTION") parts.push("interaction rules stack");
  return parts.filter(Boolean).join(" — ");
}

function extractSealedQueries(): SealedQuery[] {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const out: SealedQuery[] = [];

  for (const file of files) {
    const record = JSON.parse(readFileSync(resolve(CASES_DIR, file), "utf8")) as {
      caseId?: string;
      commanders?: string[];
      toolCallTrace?: Array<{
        callIndex?: number;
        tool?: string;
        arguments?: Record<string, unknown>;
        resultSummary?: string;
      }>;
    };
    if (!record.toolCallTrace) continue;
    for (const call of record.toolCallTrace) {
      if (call.tool !== "searchMtgKnowledge") continue;
      const query = String(call.arguments?.query ?? "").trim();
      const mode = String(call.arguments?.mode ?? "PACKAGE") as MtgKnowledgeRetrievalMode;
      if (!query) continue;
      out.push({
        queryIndex: 0,
        caseId: record.caseId ?? file.replace(/\.json$/, ""),
        callIndex: call.callIndex ?? -1,
        query,
        mode,
        commanderName: record.commanders?.[0],
        priorResultSummary: call.resultSummary,
      });
    }
  }

  out.sort((a, b) =>
    a.caseId === b.caseId ? a.callIndex - b.callIndex : a.caseId.localeCompare(b.caseId),
  );
  return out.map((q, i) => ({ ...q, queryIndex: i + 1 }));
}

async function auditCommanderPrimerCoverage(commanderNames: string[]) {
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);
  const audit: Record<string, { chunkCount: number; commanderFieldMatches: number; textMatches: number; sampleChunkIds: string[] }> = {};

  for (const name of commanderNames) {
    const lower = name.toLowerCase();
    let chunkCount = 0;
    let commanderFieldMatches = 0;
    let textMatches = 0;
    const sampleChunkIds: string[] = [];
    let last: FirebaseFirestore.DocumentSnapshot | undefined;

    while (true) {
      let q = col
        .where("active", "==", true)
        .where("corpus", "==", "commander_primer")
        .orderBy(FieldPath.documentId())
        .limit(200);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        chunkCount++;
        const data = doc.data();
        const commander = String(data.commander ?? "");
        const text = String(data.retrievalText ?? "");
        if (commander.toLowerCase().includes(lower)) commanderFieldMatches++;
        if (text.toLowerCase().includes(lower)) textMatches++;
        if (sampleChunkIds.length < 3 && text.toLowerCase().includes(lower)) sampleChunkIds.push(doc.id);
      }
      last = snap.docs[snap.docs.length - 1];
    }

    audit[name] = { chunkCount, commanderFieldMatches, textMatches, sampleChunkIds };
  }

  return audit;
}

function auditStrategyQueries(queries: SealedQuery[]) {
  const strategyQueries = queries.filter((q) => q.mode === "STRATEGY");
  const transcriptTopics = MTG_RAG_TRANSCRIPT_FILES.map((t) => ({
    filename: t.filename,
    topic: t.topic,
  }));

  return strategyQueries.map((q) => {
    const terms = q.query
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((t) => t.length >= 4);
    const topicHits = transcriptTopics.filter((t) =>
      terms.some((term) => t.topic.toLowerCase().includes(term) || t.filename.toLowerCase().includes(term)),
    );
    return {
      queryIndex: q.queryIndex,
      caseId: q.caseId,
      query: q.query,
      likelyCorpusCoverage: topicHits.length > 0 ? "PARTIAL_OR_ADJACENT" : "NOT_EVIDENT_IN_16_TRANSCRIPT_TOPICS",
      matchingTranscriptTopics: topicHits,
      note:
        topicHits.length > 0
          ? "Some adjacent transcript topics exist; retrieval quality depends on ranking/presentation."
          : "Requested strategy concept not clearly present in existing 16 transcript source topics.",
    };
  });
}

async function main() {
  loadProjectEnvLocal();
  process.env.MTG_RAG_ENABLED = "true";

  const sealedQueries = extractSealedQueries();
  if (sealedQueries.length !== 45) {
    throw new Error(`Expected 45 sealed Professor v2 queries, found ${sealedQueries.length}`);
  }

  const commanderNames = [
    "Daxos",
    "Daxos the Returned",
    "Mishra",
    "Mishra, Tamer of Mak Fawa",
    "Zaxara",
    "Atraxa",
    "Meren",
    "Muldrotha",
  ];
  const commanderPrimerAudit = await auditCommanderPrimerCoverage(commanderNames);
  const strategyFailureAudit = auditStrategyQueries(sealedQueries);

  const results = [];
  let withHits = 0;
  let priorEmpty = 0;
  let priorEmptyNowNonEmpty = 0;

  for (const q of sealedQueries) {
    const enriched = enrichQuery(q);
    const intent = MODE_INTENT[q.mode];
    const runtimeCorpora = corporaForRetrievalMode(q.mode);

    const rawByCorpus: Record<string, Awaited<ReturnType<typeof rawVectorSearchMtgChunks>>> = {};
    for (const corpus of runtimeCorpora) {
      rawByCorpus[corpus] = await rawVectorSearchMtgChunks({ query: enriched, corpus, limit: 8 });
    }

    const hybrid = await hybridRetrieveMtgKnowledge({
      question: enriched,
      intent,
      corpora: runtimeCorpora,
      mode: q.mode,
      commanderName: q.commanderName,
      limit: 12,
    });
    const service = await searchMtgKnowledge({
      query: q.query,
      mode: q.mode,
      consumer: "professor_planner",
      commanderName: q.commanderName,
      limit: 4,
    });

    const priorEmptyResult =
      q.priorResultSummary?.includes('"hits":[]') || q.priorResultSummary === '{"hits":[]}';
    if (priorEmptyResult) priorEmpty++;
    if (service.hits.length > 0) {
      withHits++;
      if (priorEmptyResult) priorEmptyNowNonEmpty++;
    }

    results.push({
      ...q,
      enrichedQuery: enriched,
      runtimeCorpora,
      rawVectorCandidatesByCorpus: rawByCorpus,
      filteredCandidates: hybrid.hits.map((h, i) => ({
        rank: i + 1,
        chunkId: h.chunk.chunkId,
        corpus: h.chunk.corpus,
        method: h.method,
        vectorDistance: h.vectorDistance,
        vectorSimilarity: h.vectorSimilarity,
        lexicalBoost: h.lexicalBoost,
        finalScore: h.finalScore,
        citationLabel: h.chunk.citationLabel,
      })),
      rankedResults: hybrid.hits.slice(0, 4).map((h, i) => ({
        rank: i + 1,
        chunkId: h.chunk.chunkId,
        score: h.finalScore ?? h.score,
        method: h.method,
      })),
      mtgKnowledgeService: service.hits.map((h, i) => ({
        rank: i + 1,
        chunkId: h.chunkId,
        corpus: h.corpus,
        score: h.finalScore ?? h.score,
        vectorDistance: h.vectorDistance,
        vectorSimilarity: h.vectorSimilarity,
        lexicalBoost: h.lexicalBoost,
        method: h.retrievalMethod,
      })),
      professorAdapter: service.hits.map((h) => ({
        chunkId: h.chunkId,
        corpus: h.corpus,
        citationLabel: h.citationLabel,
        vectorDistance: h.vectorDistance,
        vectorSimilarity: h.vectorSimilarity,
        lexicalBoost: h.lexicalBoost,
        finalScore: h.finalScore,
        retrievalTextLength: h.retrievalText.length,
        retrievalText: h.retrievalText,
      })),
      priorEmptyResult,
      repairedHasHits: service.hits.length > 0,
    });

    process.stdout.write(`\r[${q.queryIndex}/45] ${q.caseId}`);
  }

  console.log("");

  const byMode: Record<string, { total: number; withHits: number }> = {};
  const byCorpusHit: Record<string, number> = {};
  for (const r of results) {
    byMode[r.mode] = byMode[r.mode] ?? { total: 0, withHits: 0 };
    byMode[r.mode].total++;
    if (r.repairedHasHits) byMode[r.mode].withHits++;
    for (const h of r.mtgKnowledgeService) {
      byCorpusHit[h.corpus] = (byCorpusHit[h.corpus] ?? 0) + 1;
    }
  }

  const priorAdjudication = existsJson(PRIOR_ADJUDICATION_PATH)
    ? JSON.parse(readFileSync(PRIOR_ADJUDICATION_PATH, "utf8"))
    : null;

  const report = {
    version: "phase6a1-mtg-rag-professor-v2-retrieval-qa-v2",
    holdoutStatus: "SPENT_DEV_DIAGNOSTIC",
    devSpentManifest: DEV_SPENT_MANIFEST,
    generatedAt: new Date().toISOString(),
    firestoreProject: getProjectId(),
    mtgKnowledgeServiceVersion: MTG_KNOWLEDGE_SERVICE_VERSION,
    retrievalRankingVersion: MTG_RAG_RETRIEVAL_RANKING_VERSION,
    vectorRepairFreeze: VECTOR_REPAIR_FREEZE_PATH,
    priorQaArtifact: PRIOR_QA_PATH,
    priorSemanticAdjudication: priorAdjudication
      ? {
          artifact: PRIOR_ADJUDICATION_PATH,
          top1UsefulPct: priorAdjudication.summary?.top1UsefulPct,
          top4UsefulPct: priorAdjudication.summary?.top4UsefulPct,
        }
      : null,
    queryCount: sealedQueries.length,
    summary: {
      queriesWithHits: withHits,
      queriesWithoutHits: sealedQueries.length - withHits,
      priorEmptyCount: priorEmpty,
      priorEmptyNowNonEmpty: priorEmptyNowNonEmpty,
      hitRate: withHits / sealedQueries.length,
    },
    byMode,
    corpusHitCounts: byCorpusHit,
    commanderPrimerCoverageAudit: commanderPrimerAudit,
    strategyFailureAudit,
    strategyQueryIndices: STRATEGY_QUERY_INDICES,
    queries: results,
    status: "SPENT_DEV_DIAGNOSTIC_DO_NOT_USE_FOR_PROSPECTIVE_EVIDENCE",
    prospectiveHoldout: "mtg-rag-retrieval-prospective-holdout-v1",
    goldComparison: "WAIT",
    professorV3FormalRun: "WAIT",
  };

  mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath: OUT_PATH,
        sha256: createHash("sha256").update(JSON.stringify(report)).digest("hex"),
        summary: report.summary,
        byMode: report.byMode,
        commanderPrimerCoverageAudit: report.commanderPrimerCoverageAudit,
      },
      null,
      2,
    ),
  );
}

function existsJson(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
