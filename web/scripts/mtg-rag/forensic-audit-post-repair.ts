#!/usr/bin/env npx tsx
/**
 * P2/P3 — Post-repair forensic Tests A–D with stop gate after exact self-match.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FieldPath } from "firebase-admin/firestore";
import { loadProjectEnvLocal } from "../lib/script-env";
import { getProjectId, requireFirestore } from "../../src/lib/firebase/admin";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import {
  searchMtgKnowledge,
  type MtgKnowledgeRetrievalMode,
} from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "../../src/lib/mtg-rag/constants";
import { corporaForIntent } from "../../src/lib/mtg-rag/corpus-for-intent";
import {
  extractStoredEmbeddingValues,
  validateMtgKnowledgeEmbeddingValues,
} from "../../src/lib/mtg-rag/firestore-chunk-write";
import {
  rawSelfVectorSearchMtgChunk,
  rawVectorSearchMtgChunks,
} from "../../src/lib/mtg-rag/chunk-retrieval";
import { hybridRetrieveMtgKnowledge } from "../../src/lib/mtg-rag/hybrid-retrieval";
import type { MtgKnowledgeChunk, MtgKnowledgeCorpus } from "../../src/lib/mtg-rag/types";

const OUT_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-forensic-audit-post-repair-v1.json",
);

const KNOWN = {
  rulesChunkId: "000f3782acef2686691b6963d9bf7af6de2a7fe5817548f7493df6e90a350a77",
  transcriptChunkId: "064e7a505cd542015b8d5480eb898381a8a779853ec5c1fc15c17489ddf66f19",
} as const;

function preview(text: string, max = 180): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

async function loadKnownChunk(chunkId: string): Promise<MtgKnowledgeChunk & { chunkId: string }> {
  const db = requireFirestore();
  const doc = await db.collection(COLLECTIONS.mtgKnowledgeChunks).doc(chunkId).get();
  if (!doc.exists) throw new Error(`Missing chunk ${chunkId}`);
  return { ...(doc.data() as MtgKnowledgeChunk), chunkId: doc.id };
}

async function runExactSelfTest(input: {
  testId: string;
  chunkId: string;
  corpus: MtgKnowledgeCorpus;
  mode: MtgKnowledgeRetrievalMode;
}) {
  const chunk = await loadKnownChunk(input.chunkId);
  const extracted = extractStoredEmbeddingValues(chunk.embedding);
  const validated = validateMtgKnowledgeEmbeddingValues({
    values: extracted?.values,
    embeddingModel: chunk.embeddingModel,
  });
  if (!validated.ok) throw new Error(`${input.testId}: invalid stored embedding (${validated.reason})`);

  const query = preview(chunk.retrievalText, 220);
  const selfRaw = await rawSelfVectorSearchMtgChunk({
    chunkId: input.chunkId,
    corpus: input.corpus,
    values: validated.values,
    limit: 12,
  });
  const textRaw = await rawVectorSearchMtgChunks({ query, corpus: input.corpus, limit: 12 });
  const intent = input.mode === "RULES" ? "rules_question" : "deckbuilding_education";
  const hybrid = await hybridRetrieveMtgKnowledge({ question: query, intent, limit: 12 });
  const service = await searchMtgKnowledge({
    query,
    mode: input.mode,
    consumer: "professor_planner",
    limit: 4,
  });
  const professorAdapter = {
    hits: service.hits.map((h) => ({
      chunkId: h.chunkId,
      corpus: h.corpus,
      citationLabel: h.citationLabel,
      retrievalText: h.retrievalText.slice(0, 800),
    })),
  };

  const selfRank = selfRaw.candidates.find((c) => c.chunkId === input.chunkId);
  const textRank = textRaw.candidates.find((c) => c.chunkId === input.chunkId);

  return {
    testId: input.testId,
    query,
    mode: input.mode,
    sourceChunkId: input.chunkId,
    corpus: input.corpus,
    exactSelfMatchPass: selfRank != null,
    exactTextMatchPass: textRank != null,
    layers: {
      rawSelfVectorCandidates: selfRaw.candidates,
      rawTextVectorCandidates: textRaw.candidates,
      hybridRetrieveMtgKnowledge: hybrid.hits.map((h, i) => ({
        rank: i + 1,
        chunkId: h.chunk.chunkId,
        corpus: h.chunk.corpus,
        method: h.method,
        score: h.score,
        citationLabel: h.chunk.citationLabel,
      })),
      searchMtgKnowledge: service.hits.map((h, i) => ({
        rank: i + 1,
        chunkId: h.chunkId,
        corpus: h.corpus,
        method: h.retrievalMethod,
        score: h.score,
      })),
      professorSearchMtgKnowledgeAdapter: professorAdapter,
    },
    selfMatch: {
      rank: selfRank?.rank ?? null,
      distance: selfRank?.distance ?? null,
    },
    textMatch: {
      rank: textRank?.rank ?? null,
      distance: textRank?.distance ?? null,
    },
  };
}

async function runSemanticTest(input: {
  testId: string;
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  referenceChunkId?: string;
}) {
  const cfgIntent =
    input.mode === "RULES"
      ? "rules_question"
      : input.mode === "STRATEGY"
        ? "deckbuilding_education"
        : "mixed";
  const runtimeCorpora = corporaForIntent(cfgIntent);
  const rawByCorpus: Record<string, Awaited<ReturnType<typeof rawVectorSearchMtgChunks>>> = {};
  for (const corpus of runtimeCorpora) {
    rawByCorpus[corpus] = await rawVectorSearchMtgChunks({ query: input.query, corpus, limit: 12 });
  }
  const hybrid = await hybridRetrieveMtgKnowledge({ question: input.query, intent: cfgIntent, limit: 12 });
  const service = await searchMtgKnowledge({
    query: input.query,
    mode: input.mode,
    consumer: "professor_planner",
    limit: 4,
  });

  return {
    testId: input.testId,
    query: input.query,
    mode: input.mode,
    runtimeCorpora,
    referenceChunkId: input.referenceChunkId,
    rawVectorCandidatesByCorpus: rawByCorpus,
    filteredCandidates: hybrid.hits.map((h, i) => ({
      rank: i + 1,
      chunkId: h.chunk.chunkId,
      corpus: h.chunk.corpus,
      method: h.method,
      score: h.score,
      citationLabel: h.chunk.citationLabel,
    })),
    rankedResults: hybrid.hits.map((h, i) => ({
      rank: i + 1,
      chunkId: h.chunk.chunkId,
      score: h.score,
      method: h.method,
    })),
    mtgKnowledgeService: service.hits.map((h, i) => ({
      rank: i + 1,
      chunkId: h.chunkId,
      corpus: h.corpus,
      score: h.score,
      method: h.retrievalMethod,
    })),
    professorAdapter: service.hits.map((h) => ({
      chunkId: h.chunkId,
      corpus: h.corpus,
      citationLabel: h.citationLabel,
      retrievalText: h.retrievalText.slice(0, 800),
    })),
  };
}

async function main() {
  loadProjectEnvLocal();
  process.env.MTG_RAG_ENABLED = "true";

  const testA = await runExactSelfTest({
    testId: "A_exact_comprehensive_rules",
    chunkId: KNOWN.rulesChunkId,
    corpus: "comprehensive_rules",
    mode: "RULES",
  });
  const testB = await runExactSelfTest({
    testId: "B_exact_youtube_transcript",
    chunkId: KNOWN.transcriptChunkId,
    corpus: "youtube_transcript",
    mode: "STRATEGY",
  });

  const exactGatePass = testA.exactSelfMatchPass && testB.exactSelfMatchPass;
  let testC: Awaited<ReturnType<typeof runSemanticTest>> | null = null;
  let testD: Awaited<ReturnType<typeof runSemanticTest>> | null = null;
  let stopReason: string | null = null;

  if (!exactGatePass) {
    stopReason = "P2 STOP: exact self-match failed for Test A and/or Test B";
  } else {
    testC = await runSemanticTest({
      testId: "C_semantic_rules_unearth",
      query: "What happens to a creature returned with unearth at the next end step?",
      mode: "RULES",
      referenceChunkId: KNOWN.rulesChunkId,
    });
    testD = await runSemanticTest({
      testId: "D_semantic_strategy_sacrifice_recursion",
      query:
        "What strategy patterns combine repeatable sacrifice outlets with creature recursion to generate recurring death value?",
      mode: "STRATEGY",
      referenceChunkId: KNOWN.transcriptChunkId,
    });
  }

  const report = {
    version: "phase6a1-mtg-rag-forensic-audit-post-repair-v1",
    generatedAt: new Date().toISOString(),
    firestoreProject: getProjectId(),
    embeddingModel: MTG_RAG_EMBEDDING_MODEL,
    embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
    exactGatePass,
    stopReason,
    tests: {
      testA,
      testB,
      testC,
      testD,
    },
  };

  mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath: OUT_PATH,
        sha256: createHash("sha256").update(JSON.stringify(report)).digest("hex"),
        exactGatePass,
        stopReason,
      },
      null,
      2,
    ),
  );

  if (!exactGatePass) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
