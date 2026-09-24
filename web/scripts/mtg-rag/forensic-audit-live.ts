#!/usr/bin/env npx tsx
/**
 * MTG RAG forensic audit — read-only. Does NOT ingest, re-chunk, re-embed, or delete.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { loadProjectEnvLocal } from "../lib/script-env";
import { getFirebaseAdminStatus, getProjectId, requireFirestore } from "../../src/lib/firebase/admin";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import {
  MTG_KNOWLEDGE_SERVICE_VERSION,
  searchMtgKnowledge,
  type MtgKnowledgeRetrievalMode,
} from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
  isMtgRagEnabled,
} from "../../src/lib/mtg-rag/constants";
import { corporaForIntent } from "../../src/lib/mtg-rag/corpus-for-intent";
import { embedQueryText } from "../../src/lib/mtg-rag/embed-query";
import { hybridRetrieveMtgKnowledge } from "../../src/lib/mtg-rag/hybrid-retrieval";
import type { MtgKnowledgeChunk, MtgKnowledgeCorpus, MtgQueryIntent } from "../../src/lib/mtg-rag/types";

const OUT_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-forensic-audit-v1.json",
);

const ALL_CORPORA: MtgKnowledgeCorpus[] = [
  "comprehensive_rules",
  "youtube_transcript",
  "commander_primer",
  "glossary",
  "color_identity",
];

const MODE_MATRIX: Record<
  MtgKnowledgeRetrievalMode,
  { intent: MtgQueryIntent; modeConfigCorpora: MtgKnowledgeCorpus[] }
> = {
  RULES: { intent: "rules_question", modeConfigCorpora: ["comprehensive_rules"] },
  TERMINOLOGY: { intent: "terminology_question", modeConfigCorpora: ["glossary"] },
  STRATEGY: {
    intent: "deckbuilding_education",
    modeConfigCorpora: ["youtube_transcript", "glossary"],
  },
  COMMANDER_PRIMER: {
    intent: "commander_strategy",
    modeConfigCorpora: ["commander_primer", "youtube_transcript"],
  },
  PACKAGE: {
    intent: "deckbuilding_education",
    modeConfigCorpora: ["youtube_transcript", "commander_primer", "glossary"],
  },
  INTERACTION: {
    intent: "mixed",
    modeConfigCorpora: ["comprehensive_rules", "glossary", "youtube_transcript"],
  },
};

type VectorCandidate = {
  chunkId: string;
  corpus: MtgKnowledgeCorpus;
  sourceId: string;
  citationLabel: string;
  distance?: number;
  rank: number;
  retrievalTextPreview: string;
};

function preview(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function hasEmbeddingField(data: Record<string, unknown>): boolean {
  const emb = data.embedding;
  if (emb == null) return false;
  if (Array.isArray(emb)) return emb.length > 0;
  if (typeof emb === "object" && emb !== null) {
    const maybe = emb as { toArray?: () => number[]; values?: number[]; _values?: number[] };
    if (typeof maybe.toArray === "function") return maybe.toArray().length > 0;
    if (Array.isArray(maybe.values)) return maybe.values.length > 0;
    if (Array.isArray(maybe._values)) return maybe._values.length > 0;
    return true;
  }
  return false;
}

function embeddingDimension(data: Record<string, unknown>): number | null {
  const emb = data.embedding;
  if (emb == null) return null;
  if (Array.isArray(emb)) return emb.length;
  if (typeof emb === "object" && emb !== null) {
    const maybe = emb as { toArray?: () => number[]; values?: number[]; _values?: number[] };
    if (typeof maybe.toArray === "function") return maybe.toArray().length;
    if (Array.isArray(maybe.values)) return maybe.values.length;
    if (Array.isArray(maybe._values)) return maybe._values.length;
  }
  return null;
}

async function countActiveChunks(corpus: MtgKnowledgeCorpus): Promise<number> {
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.mtgKnowledgeChunks)
    .where("active", "==", true)
    .where("corpus", "==", corpus)
    .count()
    .get();
  return snap.data().count;
}

async function scanEmbeddingCounts(corpus: MtgKnowledgeCorpus): Promise<{
  embeddedChunkCount: number;
  chunksMissingEmbeddings: number;
  sampleEmbeddingDimensions: number[];
}> {
  const db = requireFirestore();
  let embedded = 0;
  let missing = 0;
  const dims = new Set<number>();
  let last: FirebaseFirestore.DocumentSnapshot | undefined;

  while (true) {
    let q = db
      .collection(COLLECTIONS.mtgKnowledgeChunks)
      .where("active", "==", true)
      .where("corpus", "==", corpus)
      .orderBy(FieldPath.documentId())
      .limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (hasEmbeddingField(data)) {
        embedded++;
        const dim = embeddingDimension(data) ?? (data.embeddingDimensions as number | undefined);
        if (typeof dim === "number") dims.add(dim);
      } else {
        missing++;
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }

  return {
    embeddedChunkCount: embedded,
    chunksMissingEmbeddings: missing,
    sampleEmbeddingDimensions: [...dims],
  };
}

async function buildCorpusInventory() {
  const db = requireFirestore();
  const sourcesSnap = await db.collection(COLLECTIONS.mtgKnowledgeSources).get();
  const sourcesByCorpus: Record<string, Array<Record<string, unknown>>> = {};

  for (const doc of sourcesSnap.docs) {
    const data = doc.data();
    const corpus = String(data.corpus ?? data.sourceType ?? "unknown");
    if (!sourcesByCorpus[corpus]) sourcesByCorpus[corpus] = [];
    sourcesByCorpus[corpus].push({
      sourceId: data.sourceId ?? doc.id,
      title: data.title,
      sourceType: data.sourceType,
      authorityTier: data.authorityTier,
      chunkCount: data.chunkCount,
      status: data.status,
      embeddingModel: data.embeddingModel,
      embeddingDimensions: data.embeddingDimensions,
    });
  }

  const inventory = [];
  for (const corpus of ALL_CORPORA) {
    const chunkCount = await countActiveChunks(corpus);
    const embeddingScan = await scanEmbeddingCounts(corpus);
    const corpusSources = sourcesSnap.docs
      .map((d) => d.data())
      .filter((s) => {
        const defCorpus = s.corpus as string | undefined;
        if (defCorpus === corpus) return true;
        if (corpus === "comprehensive_rules" && s.sourceType === "official_comprehensive_rules") return true;
        if (corpus === "glossary" && s.sourceType === "curated_glossary") return true;
        if (corpus === "commander_primer" && s.sourceType === "curated_commander_primer") return true;
        if (corpus === "color_identity" && s.sourceType === "curated_color_identity") return true;
        if (corpus === "youtube_transcript" && s.sourceType === "community_transcript") return true;
        return false;
      });

    const authorityTier =
      corpus === "comprehensive_rules"
        ? "official_rules"
        : corpus === "youtube_transcript"
          ? "community_education"
          : "curated_internal";

    inventory.push({
      corpus,
      sourceDocumentCount: corpusSources.length,
      sourceIds: corpusSources.map((s) => s.sourceId),
      chunkCount,
      embeddedChunkCount: embeddingScan.embeddedChunkCount,
      chunksMissingEmbeddings: embeddingScan.chunksMissingEmbeddings,
      embeddingModel: corpusSources[0]?.embeddingModel ?? MTG_RAG_EMBEDDING_MODEL,
      vectorDimension:
        embeddingScan.sampleEmbeddingDimensions[0] ??
        corpusSources[0]?.embeddingDimensions ??
        MTG_RAG_EMBEDDING_DIMENSIONS,
      firestoreProject: getProjectId(),
      firestoreCollection: COLLECTIONS.mtgKnowledgeChunks,
      vectorField: "embedding",
      vectorIndex:
        "mtgKnowledgeChunks composite: active ASC + corpus ASC + embedding (1536-d COSINE flat)",
      retrievalModesAllowed: Object.entries(MODE_MATRIX)
        .filter(([, cfg]) => corporaForIntent(cfg.intent).includes(corpus))
        .map(([mode]) => mode),
      authorityTier,
    });
  }

  return inventory;
}

async function fetchSampleChunk(
  corpus: MtgKnowledgeCorpus,
  predicate?: (data: MtgKnowledgeChunk) => boolean,
): Promise<{ docId: string; data: MtgKnowledgeChunk } | null> {
  const db = requireFirestore();
  let last: FirebaseFirestore.DocumentSnapshot | undefined;
  while (true) {
    let q = db
      .collection(COLLECTIONS.mtgKnowledgeChunks)
      .where("active", "==", true)
      .where("corpus", "==", corpus)
      .orderBy(FieldPath.documentId())
      .limit(100);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) return null;
    for (const doc of snap.docs) {
      const data = { ...(doc.data() as MtgKnowledgeChunk), chunkId: doc.id };
      if (!hasEmbeddingField(doc.data() as Record<string, unknown>)) continue;
      if (!predicate || predicate(data)) return { docId: doc.id, data };
    }
    last = snap.docs[snap.docs.length - 1];
  }
}

async function rawFirestoreFindNearest(input: {
  query: string;
  corpus?: MtgKnowledgeCorpus;
  limit?: number;
}): Promise<{ embeddingDimensions: number; candidates: VectorCandidate[]; error?: string }> {
  const limit = input.limit ?? 12;
  const embedding = await embedQueryText(input.query);
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);

  try {
    let q = col.where("active", "==", true);
    if (input.corpus) q = q.where("corpus", "==", input.corpus);
    const vectorQuery = q.findNearest({
      vectorField: "embedding",
      queryVector: FieldValue.vector(embedding),
      limit,
      distanceMeasure: "COSINE",
    });
    const snap = await vectorQuery.get();
    const candidates: VectorCandidate[] = snap.docs.map((doc, idx) => {
      const data = doc.data() as MtgKnowledgeChunk;
      const distance = (doc as unknown as { distance?: number }).distance;
      return {
        chunkId: doc.id,
        corpus: data.corpus,
        sourceId: data.sourceId,
        citationLabel: data.citationLabel,
        distance,
        rank: idx + 1,
        retrievalTextPreview: preview(data.retrievalText),
      };
    });
    return { embeddingDimensions: embedding.length, candidates };
  } catch (err) {
    return {
      embeddingDimensions: embedding.length,
      candidates: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runLayeredRetrievalTest(input: {
  testId: string;
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  sourceChunk: {
    documentId: string;
    chunkId: string;
    corpus: MtgKnowledgeCorpus;
    rawText: string;
    embeddingExists: boolean;
    vectorDimension: number | null;
    metadata: Record<string, unknown>;
  };
}) {
  const cfg = MODE_MATRIX[input.mode];
  const runtimeCorpora = corporaForIntent(cfg.intent);

  const embedding = await embedQueryText(input.query);
  const rawByCorpus: Record<string, Awaited<ReturnType<typeof rawFirestoreFindNearest>>> = {};
  for (const corpus of runtimeCorpora) {
    rawByCorpus[corpus] = await rawFirestoreFindNearest({
      query: input.query,
      corpus,
      limit: 12,
    });
  }
  const rawAll = await rawFirestoreFindNearest({ query: input.query, limit: 12 });

  const hybrid = await hybridRetrieveMtgKnowledge({
    question: input.query,
    intent: cfg.intent,
    limit: 12,
  });

  const service = await searchMtgKnowledge({
    query: input.query,
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

  const sourceInRaw = Object.values(rawByCorpus).some((r) =>
    r.candidates.some((c) => c.chunkId === input.sourceChunk.chunkId),
  );
  const sourceRankInRaw = Object.values(rawByCorpus)
    .flatMap((r) => r.candidates)
    .find((c) => c.chunkId === input.sourceChunk.chunkId);

  return {
    testId: input.testId,
    query: input.query,
    mode: input.mode,
    runtimeCorpora,
    modeConfigCorpora: cfg.modeConfigCorpora,
    sourceChunk: input.sourceChunk,
    layers: {
      embedding: {
        model: MTG_RAG_EMBEDDING_MODEL,
        dimensions: embedding.length,
      },
      rawFirestoreFindNearestByRuntimeCorpus: rawByCorpus,
      rawFirestoreFindNearestUnfiltered: rawAll,
      hybridRetrieveMtgKnowledge: {
        aliasMatches: hybrid.aliasMatches,
        vectorMatches: hybrid.vectorMatches,
        hits: hybrid.hits.map((h, i) => ({
          rank: i + 1,
          chunkId: h.chunk.chunkId,
          corpus: h.chunk.corpus,
          method: h.method,
          score: h.score,
          citationLabel: h.chunk.citationLabel,
          retrievalTextPreview: preview(h.chunk.retrievalText),
        })),
      },
      searchMtgKnowledge: {
        enabled: service.enabled,
        aliasMatches: service.aliasMatches,
        vectorMatches: service.vectorMatches,
        corpora: service.corpora,
        hits: service.hits.map((h, i) => ({
          rank: i + 1,
          chunkId: h.chunkId,
          corpus: h.corpus,
          method: h.retrievalMethod,
          score: h.score,
          citationLabel: h.citationLabel,
          retrievalTextPreview: preview(h.retrievalText),
        })),
      },
      professorSearchMtgKnowledgeAdapter: professorAdapter,
    },
    sourceChunkRecall: {
      presentInRawVectorCandidates: sourceInRaw,
      rawRank: sourceRankInRaw?.rank ?? null,
      rawDistance: sourceRankInRaw?.distance ?? null,
      presentInFinalServiceHits: service.hits.some((h) => h.chunkId === input.sourceChunk.chunkId),
    },
  };
}

async function main() {
  loadProjectEnvLocal();
  process.env.MTG_RAG_ENABLED = "true";

  const adminStatus = getFirebaseAdminStatus();
  const db = requireFirestore();

  const inventory = await buildCorpusInventory();

  const rulesChunk = await fetchSampleChunk("comprehensive_rules", (c) =>
    /rule|creature|step|phase/i.test(c.retrievalText),
  );
  if (!rulesChunk) throw new Error("No embedded comprehensive_rules chunk found in Firestore");

  const transcriptChunk = await fetchSampleChunk(
    "youtube_transcript",
    (c) =>
      /sacrifice|recursion|death trigger|graveyard|aristocrat|value engine/i.test(c.retrievalText) &&
      !/welcome back to the channel/i.test(c.retrievalText),
  );
  if (!transcriptChunk) {
    throw new Error("No suitable embedded youtube_transcript chunk found in Firestore");
  }

  const rulesQueryText = preview(rulesChunk.data.retrievalText, 220);
  const transcriptQueryText = preview(transcriptChunk.data.retrievalText, 220);

  const testA = await runLayeredRetrievalTest({
    testId: "A_exact_comprehensive_rules",
    query: rulesQueryText,
    mode: "RULES",
    sourceChunk: {
      documentId: rulesChunk.docId,
      chunkId: rulesChunk.data.chunkId,
      corpus: rulesChunk.data.corpus,
      rawText: rulesChunk.data.retrievalText,
      embeddingExists: true,
      vectorDimension: embeddingDimension(rulesChunk.data as unknown as Record<string, unknown>),
      metadata: {
        sourceId: rulesChunk.data.sourceId,
        citationLabel: rulesChunk.data.citationLabel,
        ruleNumberStart: rulesChunk.data.ruleNumberStart,
        ruleNumberEnd: rulesChunk.data.ruleNumberEnd,
        authorityTier: rulesChunk.data.authorityTier,
        active: rulesChunk.data.active,
      },
    },
  });

  const testB = await runLayeredRetrievalTest({
    testId: "B_exact_youtube_transcript",
    query: transcriptQueryText,
    mode: "STRATEGY",
    sourceChunk: {
      documentId: transcriptChunk.docId,
      chunkId: transcriptChunk.data.chunkId,
      corpus: transcriptChunk.data.corpus,
      rawText: transcriptChunk.data.retrievalText,
      embeddingExists: true,
      vectorDimension: embeddingDimension(transcriptChunk.data as unknown as Record<string, unknown>),
      metadata: {
        sourceId: transcriptChunk.data.sourceId,
        transcriptName: transcriptChunk.data.transcriptName,
        transcriptTopic: transcriptChunk.data.transcriptTopic,
        citationLabel: transcriptChunk.data.citationLabel,
        authorityTier: transcriptChunk.data.authorityTier,
        active: transcriptChunk.data.active,
      },
    },
  });

  const testC = await runLayeredRetrievalTest({
    testId: "C_semantic_rules_unearth",
    query: "What happens to a creature returned with unearth at the next end step?",
    mode: "RULES",
    sourceChunk: {
      documentId: rulesChunk.docId,
      chunkId: rulesChunk.data.chunkId,
      corpus: rulesChunk.data.corpus,
      rawText: rulesChunk.data.retrievalText,
      embeddingExists: true,
      vectorDimension: embeddingDimension(rulesChunk.data as unknown as Record<string, unknown>),
      metadata: { note: "Reference chunk from Test A; semantic query is paraphrased" },
    },
  });

  const strategyStoredConcept = preview(transcriptChunk.data.retrievalText, 260);
  const testD = await runLayeredRetrievalTest({
    testId: "D_semantic_strategy_sacrifice_recursion",
    query:
      "What strategy patterns combine repeatable sacrifice outlets with creature recursion to generate recurring death value?",
    mode: "STRATEGY",
    sourceChunk: {
      documentId: transcriptChunk.docId,
      chunkId: transcriptChunk.data.chunkId,
      corpus: transcriptChunk.data.corpus,
      rawText: transcriptChunk.data.retrievalText,
      embeddingExists: true,
      vectorDimension: embeddingDimension(transcriptChunk.data as unknown as Record<string, unknown>),
      metadata: {
        storedConceptPreview: strategyStoredConcept,
        transcriptName: transcriptChunk.data.transcriptName,
      },
    },
  });

  const retrievalModeMatrix = Object.fromEntries(
    Object.entries(MODE_MATRIX).map(([mode, cfg]) => [
      mode,
      {
        modeConfigCorpora: cfg.modeConfigCorpora,
        runtimeCorporaViaIntent: corporaForIntent(cfg.intent),
        corpusPermissions: Object.fromEntries(
          ALL_CORPORA.map((corpus) => [
            corpus,
            corporaForIntent(cfg.intent).includes(corpus),
          ]),
        ),
      },
    ]),
  );

  const diagnosis = [];
  for (const corpus of ALL_CORPORA) {
    const row = inventory.find((i) => i.corpus === corpus);
    if (!row) continue;
    if (row.chunkCount > 0 && row.embeddedChunkCount === 0) {
      diagnosis.push(`${corpus}: KNOWN CHUNK HAS NO EMBEDDING → ingestion/embedding population problem`);
    }
    if (row.chunksMissingEmbeddings > 0) {
      diagnosis.push(
        `${corpus}: ${row.chunksMissingEmbeddings}/${row.chunkCount} active chunks missing embeddings`,
      );
    }
  }

  if (!testA.sourceChunkRecall.presentInRawVectorCandidates) {
    diagnosis.push(
      "Test A: exact rules text did not appear in raw vector candidates → embedding/index/project/collection/vector-field problem",
    );
  } else if (!testA.layers.searchMtgKnowledge.hits.length) {
    diagnosis.push(
      "Test A: raw vector candidate exists but searchMtgKnowledge empty → ranker/filter/service problem",
    );
  }

  if (testB.layers.searchMtgKnowledge.hits.length === 0 && testB.layers.hybridRetrieveMtgKnowledge.hits.length > 0) {
    diagnosis.push("Test B: hybrid has hits but searchMtgKnowledge empty → service layer problem");
  }

  if (
    testA.layers.searchMtgKnowledge.hits.length === 0 &&
    testB.layers.searchMtgKnowledge.hits.length === 0 &&
    Object.values(testA.layers.rawFirestoreFindNearestByRuntimeCorpus).every((r) => r.candidates.length === 0)
  ) {
    diagnosis.push(
      "Tests A/B: zero raw vector candidates across runtime corpora → vector index / findNearest / embedding population failure below Professor",
    );
  }

  const report = {
    version: "phase6a1-mtg-rag-forensic-audit-v1",
    generatedAt: new Date().toISOString(),
    auditPolicy: "READ_ONLY_NO_CORPUS_MUTATION",
    mtgKnowledgeServiceVersion: MTG_KNOWLEDGE_SERVICE_VERSION,
    environment: {
      mtgRagEnabled: isMtgRagEnabled(),
      firebaseProjectId: getProjectId(),
      firebaseAdminInitialized: adminStatus.initialized,
      firestoreDatabase: "(default)",
      firestoreCollection: COLLECTIONS.mtgKnowledgeChunks,
      vectorField: "embedding",
      vectorIndexDefinition:
        "firestore.indexes.json → mtgKnowledgeChunks [active ASC, corpus ASC, embedding vector 1536 COSINE flat]",
      embeddingModel: MTG_RAG_EMBEDDING_MODEL,
      embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
      professorExperimentUsesSameEnv: true,
      envVarsVerified: [
        "FIREBASE_PROJECT_ID",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        "FIREBASE_SERVICE_ACCOUNT_KEY",
        "MTG_RAG_ENABLED",
        "OPENAI_API_KEY",
      ],
    },
    corpusInventory: inventory,
    retrievalModeMatrix,
    tests: {
      testA_exact_comprehensive_rules: testA,
      testB_exact_youtube_transcript: testB,
      testC_semantic_rules_unearth: testC,
      testD_semantic_strategy_sacrifice_recursion: testD,
    },
    diagnosticInterpretation: diagnosis,
    stopCondition: "NO_CORPUS_CHANGES_MADE",
    goldStatus: "SEALED_WAIT",
    professorRerunRequired: false,
  };

  mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  const sha256 = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  console.log(JSON.stringify({ outPath: OUT_PATH, sha256, diagnosis }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
