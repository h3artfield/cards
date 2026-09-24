#!/usr/bin/env npx tsx
/**
 * Run prospective MTG RAG retrieval holdout QA.
 * Default: holdout v3 (active). v1/v2 are SPENT diagnostic sets.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "../lib/script-env";
import { getProjectId } from "../../src/lib/firebase/admin";
import {
  MTG_KNOWLEDGE_SERVICE_VERSION,
  searchMtgKnowledge,
  type MtgKnowledgeRetrievalMode,
} from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import { corporaForRetrievalMode } from "../../src/lib/mtg-rag/corpora-for-mode";
import { rawVectorSearchMtgChunks } from "../../src/lib/mtg-rag/chunk-retrieval";
import { hybridRetrieveMtgKnowledge } from "../../src/lib/mtg-rag/hybrid-retrieval";
import {
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1,
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1_VERSION,
} from "../../src/lib/mtg-rag/mtg-rag-retrieval-prospective-holdout-v1";
import {
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2,
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2_VERSION,
} from "../../src/lib/mtg-rag/mtg-rag-retrieval-prospective-holdout-v2";
import {
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3,
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3_VERSION,
  type MtgRagRetrievalHoldoutQuery,
} from "../../src/lib/mtg-rag/mtg-rag-retrieval-prospective-holdout-v3";
import { MTG_RAG_RETRIEVAL_RANKING_VERSION } from "../../src/lib/mtg-rag/retrieval-ranking";

const HOLDOUT_VERSION = process.env.MTG_RAG_HOLDOUT_VERSION ?? "v3";

const HOLDOUT_CONFIG: Record<
  string,
  {
    holdout: MtgRagRetrievalHoldoutQuery[];
    version: string;
    outFile: string;
    spentManifest?: string;
    priorHoldoutSpent?: string;
  }
> = {
  v1: {
    holdout: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1,
    version: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1_VERSION,
    outFile: "mtg-rag-retrieval-prospective-holdout-qa-v1.json",
    spentManifest: "mtg-rag-retrieval-prospective-holdout-v1-spent-manifest-v1.json",
  },
  v2: {
    holdout: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2,
    version: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2_VERSION,
    outFile: "mtg-rag-retrieval-prospective-holdout-qa-v2.json",
    priorHoldoutSpent: "mtg-rag-retrieval-prospective-holdout-v1-spent-manifest-v1.json",
    spentManifest: "mtg-rag-retrieval-prospective-holdout-v2-spent-manifest-v1.json",
  },
  v3: {
    holdout: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3,
    version: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3_VERSION,
    outFile: "mtg-rag-retrieval-prospective-holdout-qa-v3.json",
    priorHoldoutSpent: "mtg-rag-retrieval-prospective-holdout-v2-spent-manifest-v1.json",
  },
};

const MODE_INTENT: Record<MtgKnowledgeRetrievalMode, import("../../src/lib/mtg-rag/types").MtgQueryIntent> = {
  RULES: "rules_question",
  TERMINOLOGY: "terminology_question",
  STRATEGY: "deckbuilding_education",
  COMMANDER_PRIMER: "commander_strategy",
  PACKAGE: "deckbuilding_education",
  INTERACTION: "mixed",
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

async function main() {
  loadProjectEnvLocal();
  process.env.MTG_RAG_ENABLED = "true";

  const cfg = HOLDOUT_CONFIG[HOLDOUT_VERSION];
  if (!cfg) throw new Error(`Unknown holdout version: ${HOLDOUT_VERSION}`);

  const holdout = cfg.holdout;
  const OUT_PATH = resolve("data/milestones/deck-synthesis", cfg.outFile);

  const results = [];
  let withHits = 0;

  for (let i = 0; i < holdout.length; i++) {
    const q = holdout[i];
    const queryIndex = i + 1;
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

    if (service.hits.length > 0) withHits++;

    results.push({
      queryIndex,
      holdoutId: q.id,
      mode: q.mode,
      query: q.query,
      commanderName: q.commanderName,
      designNote: q.designNote,
      enrichedQuery: enriched,
      runtimeCorpora,
      rawVectorCandidatesByCorpus: rawByCorpus,
      lexicalMatches: service.lexicalMatches,
      vectorMatches: service.vectorMatches,
      filteredCandidates: hybrid.hits.map((h, rank) => ({
        rank: rank + 1,
        chunkId: h.chunk.chunkId,
        corpus: h.chunk.corpus,
        method: h.method,
        matchTier: h.matchTier,
        vectorDistance: h.vectorDistance,
        vectorSimilarity: h.vectorSimilarity,
        lexicalBoost: h.lexicalBoost,
        rrfScore: h.rrfScore,
        aliasSpecificity: h.aliasSpecificity,
        finalScore: h.finalScore,
        citationLabel: h.chunk.citationLabel,
      })),
      professorAdapter: service.hits.map((h) => ({
        chunkId: h.chunkId,
        corpus: h.corpus,
        citationLabel: h.citationLabel,
        retrievalMethod: h.retrievalMethod,
        matchTier: h.matchTier,
        vectorDistance: h.vectorDistance,
        vectorSimilarity: h.vectorSimilarity,
        lexicalBoost: h.lexicalBoost,
        rrfScore: h.rrfScore,
        aliasSpecificity: h.aliasSpecificity,
        finalScore: h.finalScore,
        retrievalTextLength: h.retrievalText.length,
        retrievalText: h.retrievalText,
      })),
      hasHits: service.hits.length > 0,
    });

    process.stdout.write(`\r[${queryIndex}/${holdout.length}] ${q.id}`);
  }

  console.log("");

  const byMode: Record<string, { total: number; withHits: number; lexicalHitQueries: number }> = {};
  for (const r of results) {
    byMode[r.mode] = byMode[r.mode] ?? { total: 0, withHits: 0, lexicalHitQueries: 0 };
    byMode[r.mode].total++;
    if (r.hasHits) byMode[r.mode].withHits++;
    if (r.lexicalMatches > 0) byMode[r.mode].lexicalHitQueries++;
  }

  const report = {
    version: cfg.outFile.replace(".json", ""),
    generatedAt: new Date().toISOString(),
    firestoreProject: getProjectId(),
    holdoutVersion: cfg.version,
    holdoutQueryCount: holdout.length,
    mtgKnowledgeServiceVersion: MTG_KNOWLEDGE_SERVICE_VERSION,
    retrievalRankingVersion: MTG_RAG_RETRIEVAL_RANKING_VERSION,
    priorHoldoutSpent: cfg.priorHoldoutSpent
      ? resolve("data/milestones/deck-synthesis", cfg.priorHoldoutSpent)
      : undefined,
    holdoutSpentManifest: cfg.spentManifest
      ? resolve("data/milestones/deck-synthesis", cfg.spentManifest)
      : undefined,
    devSpentManifest: resolve(
      "data/milestones/deck-synthesis/phase6a1-mtg-rag-professor-v2-retrieval-dev-spent-manifest-v1.json",
    ),
    goldComparison: "KEEP_SEALED",
    semanticRetrievalFreeze: "BLOCK_PENDING_HOLDOUT_ADJUDICATION",
    gateDisposition: {
      semanticRetrievalFreeze: "BLOCK",
      professorV3: "BLOCKED_BY_RETRIEVAL",
      goldComparison: "KEEP_SEALED",
      corpusIngest: "KEEP_BLOCKED",
    },
    summary: {
      queriesWithHits: withHits,
      queriesWithoutHits: holdout.length - withHits,
      hitRate: withHits / holdout.length,
    },
    byMode,
    queries: results,
    status: "REPORT_AND_WAIT_FOR_INDEPENDENT_SEMANTIC_GRADE",
  };

  mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  const sha256 = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  console.log(
    JSON.stringify(
      {
        holdoutVersion: HOLDOUT_VERSION,
        outPath: OUT_PATH,
        sha256,
        summary: report.summary,
        byMode: report.byMode,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
