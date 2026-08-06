/** Bump when ingestion logic or chunking strategy changes materially. */
export const MTG_RAG_INGESTION_VERSION = "phase2-v1";

export const MTG_RAG_EMBEDDING_MODEL = "text-embedding-3-small";
export const MTG_RAG_EMBEDDING_DIMENSIONS = 1536;

/** GCS prefix for immutable originals (under the Firebase/default bucket). */
export const MTG_RAG_GCS_PREFIX = "mtg-rag/raw";

/** Feature flag — set MTG_RAG_ENABLED=true in env to wire clerk knowledge retrieval. */
export function isMtgRagEnabled(): boolean {
  return process.env.MTG_RAG_ENABLED?.trim().toLowerCase() === "true";
}

/** Max chunks returned per hybrid retrieval call. */
export const MTG_RAG_RETRIEVAL_LIMIT = 8;

/** Vector search candidate pool per corpus filter. */
export const MTG_RAG_VECTOR_LIMIT = 12;
