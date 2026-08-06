import type { MtgKnowledgeChunk } from "../../../src/lib/mtg-rag/types";

/** Shared chunker output — embeddings added in Phase 2. */
export type ChunkDraft = Omit<
  MtgKnowledgeChunk,
  "importedAt" | "embedding"
> & {
  aliasesForIndex?: string[];
};

export interface ChunkerResult {
  chunks: ChunkDraft[];
  aliasCount: number;
}

export interface ChunkerContext {
  sourceId: string;
  localPath: string;
  filename: string;
  contentHash: string;
}

export type MtgRagChunker = (ctx: ChunkerContext) => Promise<ChunkerResult>;
