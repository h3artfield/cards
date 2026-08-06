import { Timestamp } from "firebase-admin/firestore";
import {
  deactivateStaleMtgAliases,
  deactivateStaleMtgChunks,
  upsertMtgKnowledgeAliases,
  upsertMtgKnowledgeChunks,
} from "../../src/lib/mtg-rag/chunk-store";
import type { MtgKnowledgeAlias } from "../../src/lib/mtg-rag/types";
import {
  updateMtgKnowledgeSourceChunkCount,
} from "../../src/lib/mtg-rag/source-store";
import { runChunker } from "./chunkers";
import type { ChunkDraft } from "./chunkers/types";
import { embedTexts } from "./embed";
import { aliasEntriesFromTerms, fitDraftsForEmbedding } from "./lib/chunk-build";
import type { ResolvedSourceFile } from "./lib/resolve-sources";

export interface ChunkPipelineOptions {
  dryRun: boolean;
  embed: boolean;
  writeFirestore: boolean;
  limit?: number;
}

export interface ChunkPipelineResult {
  chunkCount: number;
  aliasCount: number;
  embedded: boolean;
}

function draftsToAliases(
  drafts: ChunkDraft[],
  sourceId: string,
): MtgKnowledgeAlias[] {
  const aliases: MtgKnowledgeAlias[] = [];
  const now = Timestamp.now();

  for (const draft of drafts) {
    if (!draft.aliasesForIndex?.length) continue;
    for (const entry of aliasEntriesFromTerms({
      terms: draft.aliasesForIndex,
      corpus: draft.corpus,
      chunkId: draft.chunkId,
      sourceId,
    })) {
      aliases.push({
        aliasHash: entry.aliasHash,
        alias: entry.alias,
        normalizedAlias: entry.normalizedAlias,
        corpus: draft.corpus,
        chunkId: draft.chunkId,
        sourceId,
        active: true,
        importedAt: now,
      });
    }
  }

  return aliases;
}

export async function runChunkPipeline(
  def: ResolvedSourceFile["definition"] & { transcriptTopic?: string },
  primary: ResolvedSourceFile,
  opts: ChunkPipelineOptions,
): Promise<ChunkPipelineResult> {
  const ctx = {
    sourceId: def.sourceId,
    localPath: primary.localPath,
    filename: primary.filename,
    contentHash: primary.contentHash,
  };

  const { chunks: rawDrafts, aliasCount: estimatedAliases } = await runChunker(def, ctx);
  const drafts = fitDraftsForEmbedding(rawDrafts);
  const limited = opts.limit ? drafts.slice(0, opts.limit) : drafts;

  console.log(
    `    chunks: ${limited.length}${opts.limit ? ` (limit ${opts.limit}/${drafts.length})` : ""}, ~${estimatedAliases} aliases`,
  );

  if (opts.dryRun) return { chunkCount: limited.length, aliasCount: estimatedAliases, embedded: false };

  let embeddings: number[][] = [];
  if (opts.embed && limited.length > 0) {
    console.log(`    embedding ${limited.length} chunks…`);
    embeddings = await embedTexts(limited.map((c) => c.retrievalText));
  }

  if (!opts.writeFirestore) {
    return { chunkCount: limited.length, aliasCount: estimatedAliases, embedded: opts.embed };
  }

  const now = Timestamp.now();
  const chunkDocs = limited.map((draft, i) => {
    const { aliasesForIndex: _a, ...rest } = draft;
    return {
      ...rest,
      importedAt: now,
      ...(embeddings[i] ? { embedding: embeddings[i] } : {}),
    };
  });

  await upsertMtgKnowledgeChunks(chunkDocs);

  const aliases = draftsToAliases(limited, def.sourceId);
  await upsertMtgKnowledgeAliases(aliases);

  const activeChunkIds = new Set(limited.map((c) => c.chunkId));
  const activeAliasHashes = new Set(aliases.map((a) => a.aliasHash));
  const deactivatedChunks = await deactivateStaleMtgChunks({
    sourceId: def.sourceId,
    activeChunkIds,
  });
  const deactivatedAliases = await deactivateStaleMtgAliases({
    sourceId: def.sourceId,
    activeAliasHashes,
  });

  if (deactivatedChunks || deactivatedAliases) {
    console.log(
      `    deactivated stale: ${deactivatedChunks} chunks, ${deactivatedAliases} aliases`,
    );
  }

  await updateMtgKnowledgeSourceChunkCount(def.sourceId, limited.length);

  return {
    chunkCount: limited.length,
    aliasCount: aliases.length,
    embedded: opts.embed,
  };
}
