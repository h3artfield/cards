import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "../firebase/collections";
import { requireFirestore } from "../firebase/admin";
import { MTG_RAG_VECTOR_LIMIT } from "./constants";
import { embedQueryText } from "./embed-query";
import { extractStoredEmbeddingValues } from "./firestore-chunk-write";
import type { MtgKnowledgeChunk, MtgKnowledgeCorpus } from "./types";

export class MtgVectorIndexError extends Error {
  readonly corpus?: MtgKnowledgeCorpus;
  readonly operationalKind = "VECTOR_INDEX_OR_STORAGE_FAILURE" as const;

  constructor(message: string, corpus?: MtgKnowledgeCorpus) {
    super(message);
    this.name = "MtgVectorIndexError";
    this.corpus = corpus;
  }
}

function isVectorIndexFailure(message: string): boolean {
  return (
    message.includes("FAILED_PRECONDITION") ||
    message.includes("index is currently building") ||
    message.includes("Missing vector index configuration")
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function readDocumentVectorDistance(doc: FirebaseFirestore.QueryDocumentSnapshot): number | undefined {
  const direct = (doc as unknown as { distance?: number }).distance;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const vectorDistance = (doc as unknown as { vectorDistance?: number }).vectorDistance;
  if (typeof vectorDistance === "number" && Number.isFinite(vectorDistance)) return vectorDistance;
  return undefined;
}

export type VectorSearchHit = {
  chunk: MtgKnowledgeChunk;
  vectorDistance?: number;
  vectorSimilarity: number;
};

export async function vectorSearchMtgChunks(input: {
  query: string;
  corpora?: MtgKnowledgeCorpus[];
  limit?: number;
  queryEmbedding?: number[];
}): Promise<VectorSearchHit[]> {
  const limit = input.limit ?? MTG_RAG_VECTOR_LIMIT;
  const embedding = input.queryEmbedding ?? (await embedQueryText(input.query));
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);

  const corpora = input.corpora?.length ? input.corpora : undefined;
  const hits: VectorSearchHit[] = [];
  const seen = new Set<string>();
  const indexErrors: Array<{ corpus?: MtgKnowledgeCorpus; message: string }> = [];

  const runSearch = async (corpus?: MtgKnowledgeCorpus) => {
    try {
      let q = col.where("active", "==", true);
      if (corpus) q = q.where("corpus", "==", corpus);

      const snap = await q
        .findNearest({
          vectorField: "embedding",
          queryVector: FieldValue.vector(embedding),
          limit,
          distanceMeasure: "COSINE",
        })
        .get();

      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const data = doc.data() as MtgKnowledgeChunk;
        const stored = extractStoredEmbeddingValues(data.embedding)?.values;
        const vectorDistance = readDocumentVectorDistance(doc);
        const vectorSimilarity =
          stored && stored.length === embedding.length
            ? cosineSimilarity(embedding, stored)
            : vectorDistance != null
              ? Math.max(0, 1 - vectorDistance)
              : 0.75;
        hits.push({
          chunk: { ...data, chunkId: doc.id },
          vectorDistance,
          vectorSimilarity,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isVectorIndexFailure(message)) {
        indexErrors.push({ corpus, message });
        return;
      }
      throw err;
    }
  };

  if (corpora) {
    for (const corpus of corpora) {
      await runSearch(corpus);
    }
  } else {
    await runSearch();
  }

  if (indexErrors.length > 0) {
    const searched = corpora?.length ?? 1;
    if (indexErrors.length >= searched && hits.length === 0) {
      const detail = indexErrors
        .map((e) => (e.corpus ? `${e.corpus}: ${e.message}` : e.message))
        .join(" | ");
      throw new MtgVectorIndexError(
        `MTG vector search failed for all queried corpora (${detail})`,
        indexErrors[0]?.corpus,
      );
    }
  }

  return hits
    .sort((a, b) => b.vectorSimilarity - a.vectorSimilarity)
    .slice(0, limit);
}

export type RawVectorCandidate = {
  chunkId: string;
  corpus: MtgKnowledgeCorpus;
  citationLabel: string;
  vectorDistance?: number;
  vectorSimilarity?: number;
  rank: number;
  retrievalTextPreview: string;
};

/** Forensic/QA helper — returns raw nearest neighbors with cosine distance/similarity. */
export async function rawVectorSearchMtgChunks(input: {
  query: string;
  corpus?: MtgKnowledgeCorpus;
  limit?: number;
}): Promise<{ embeddingDimensions: number; candidates: RawVectorCandidate[] }> {
  const limit = input.limit ?? MTG_RAG_VECTOR_LIMIT;
  const embedding = await embedQueryText(input.query);
  const hits = await vectorSearchMtgChunks({
    query: input.query,
    corpora: input.corpus ? [input.corpus] : undefined,
    limit,
    queryEmbedding: embedding,
  });

  return {
    embeddingDimensions: embedding.length,
    candidates: hits.map((hit, idx) => ({
      chunkId: hit.chunk.chunkId,
      corpus: hit.chunk.corpus,
      citationLabel: hit.chunk.citationLabel,
      vectorDistance: hit.vectorDistance,
      vectorSimilarity: hit.vectorSimilarity,
      rank: idx + 1,
      retrievalTextPreview: hit.chunk.retrievalText.replace(/\s+/g, " ").trim().slice(0, 180),
    })),
  };
}

/** Self-match QA — query using a chunk's stored numeric embedding. */
export async function rawSelfVectorSearchMtgChunk(input: {
  chunkId: string;
  corpus: MtgKnowledgeCorpus;
  values: number[];
  limit?: number;
}): Promise<{ embeddingDimensions: number; candidates: RawVectorCandidate[] }> {
  const hits = await vectorSearchMtgChunks({
    query: input.chunkId,
    corpora: [input.corpus],
    limit: input.limit ?? MTG_RAG_VECTOR_LIMIT,
    queryEmbedding: input.values,
  });

  return {
    embeddingDimensions: input.values.length,
    candidates: hits.map((hit, idx) => ({
      chunkId: hit.chunk.chunkId,
      corpus: hit.chunk.corpus,
      citationLabel: hit.chunk.citationLabel,
      vectorDistance: hit.vectorDistance,
      vectorSimilarity: hit.vectorSimilarity,
      rank: idx + 1,
      retrievalTextPreview: hit.chunk.retrievalText.replace(/\s+/g, " ").trim().slice(0, 180),
    })),
  };
}
