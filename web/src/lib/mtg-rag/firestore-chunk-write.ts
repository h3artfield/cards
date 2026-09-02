import { FieldValue } from "firebase-admin/firestore";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "./constants";
import type { MtgKnowledgeChunk } from "./types";

/** Strip undefined scalar fields without JSON serialization (preserves Timestamp, etc.). */
function stripUndefinedFields(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue !== undefined) out[key] = fieldValue;
  }
  return out;
}

export type StoredEmbeddingValues = {
  values: number[];
  source: "array" | "vector_values" | "vector_toArray";
};

export function extractStoredEmbeddingValues(embedding: unknown): StoredEmbeddingValues | null {
  if (embedding == null) return null;
  if (Array.isArray(embedding)) {
    return embedding.length > 0 ? { values: embedding, source: "array" } : null;
  }
  if (typeof embedding === "object") {
    const maybe = embedding as {
      toArray?: () => number[];
      _values?: number[];
      values?: number[];
    };
    if (typeof maybe.toArray === "function") {
      const values = maybe.toArray();
      return values.length > 0 ? { values, source: "vector_toArray" } : null;
    }
    if (Array.isArray(maybe._values) && maybe._values.length > 0) {
      return { values: maybe._values, source: "vector_values" };
    }
    if (Array.isArray(maybe.values) && maybe.values.length > 0) {
      return { values: maybe.values, source: "vector_values" };
    }
  }
  return null;
}

export type EmbeddingValidationResult =
  | { ok: true; values: number[]; source: StoredEmbeddingValues["source"] }
  | { ok: false; reason: string };

export function validateMtgKnowledgeEmbeddingValues(input: {
  values: number[] | null | undefined;
  embeddingModel?: string;
  expectedDimensions?: number;
}): EmbeddingValidationResult {
  const expectedDimensions = input.expectedDimensions ?? MTG_RAG_EMBEDDING_DIMENSIONS;
  if (!input.values || input.values.length === 0) {
    return { ok: false, reason: "missing_values" };
  }
  if (input.values.length !== expectedDimensions) {
    return { ok: false, reason: `dimension_mismatch:${input.values.length}` };
  }
  if (!input.values.every((n) => Number.isFinite(n))) {
    return { ok: false, reason: "non_finite_values" };
  }
  if (input.embeddingModel && input.embeddingModel !== MTG_RAG_EMBEDDING_MODEL) {
    return { ok: false, reason: `model_mismatch:${input.embeddingModel}` };
  }
  return { ok: true, values: input.values, source: "array" };
}

/**
 * Prepare an mtgKnowledgeChunks document for Firestore write.
 * Never pass FieldValue.vector through JSON sanitizers.
 */
export function prepareMtgKnowledgeChunkForWrite(
  chunk: MtgKnowledgeChunk & { embedding?: number[] },
): Record<string, unknown> {
  const { embedding, ...rest } = chunk;
  const doc = stripUndefinedFields(rest as Record<string, unknown>);
  if (embedding?.length) {
    doc.embedding = FieldValue.vector(embedding);
  }
  return doc;
}

export function prepareMtgKnowledgeChunkVectorMigrationUpdate(input: {
  values: number[];
}): Record<string, unknown> {
  return {
    embedding: FieldValue.vector(input.values),
    embeddingModel: MTG_RAG_EMBEDDING_MODEL,
    embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
  };
}
