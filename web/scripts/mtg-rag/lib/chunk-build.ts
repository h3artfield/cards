import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "../../../src/lib/mtg-rag/constants";
import { aliasHashFromNormalized, chunkIdFromParts, normalizeAlias, sha256Hex } from "../../../src/lib/mtg-rag/hash";
import type { MtgKnowledgeCorpus } from "../../../src/lib/mtg-rag/types";
import type { ChunkDraft } from "../chunkers/types";
import {
  MAX_EMBED_TOKENS,
  estimateTokenCount,
  splitToMaxEmbedSize,
} from "./token-estimate";

type AuthorityTier = ChunkDraft["authorityTier"];

export function buildChunkDraft(input: {
  sourceId: string;
  corpus: MtgKnowledgeCorpus;
  authorityTier: AuthorityTier;
  title: string;
  sectionTitle?: string;
  sectionPath: string;
  text: string;
  retrievalText: string;
  chunkIndex: number;
  citationLabel: string;
  sourceLocator: string;
  aliasesForIndex?: string[];
  normalizedTerms?: string[];
  keywords?: string[];
  tags?: string[];
  commander?: string;
  colorIdentity?: string[];
  archetypes?: string[];
  ruleNumberStart?: string;
  ruleNumberEnd?: string;
  parentRule?: string;
  transcriptName?: string;
  transcriptTopic?: string;
}): ChunkDraft {
  const normalized = input.text.trim();
  const chunkHash = sha256Hex(`${input.sourceId}\0${input.sectionPath}\0${normalized}`);

  return {
    chunkId: chunkIdFromParts([input.sourceId, input.sectionPath, chunkHash]),
    sourceId: input.sourceId,
    corpus: input.corpus,
    authorityTier: input.authorityTier,
    title: input.title,
    sectionTitle: input.sectionTitle,
    sectionPath: input.sectionPath,
    text: normalized,
    retrievalText: input.retrievalText.trim(),
    aliases: input.aliasesForIndex,
    normalizedTerms: input.normalizedTerms,
    keywords: input.keywords,
    tags: input.tags,
    commander: input.commander,
    colorIdentity: input.colorIdentity,
    archetypes: input.archetypes,
    ruleNumberStart: input.ruleNumberStart,
    ruleNumberEnd: input.ruleNumberEnd,
    parentRule: input.parentRule,
    transcriptName: input.transcriptName,
    transcriptTopic: input.transcriptTopic,
    citationLabel: input.citationLabel,
    sourceLocator: input.sourceLocator,
    embeddingModel: MTG_RAG_EMBEDDING_MODEL,
    embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
    tokenCount: estimateTokenCount(normalized),
    chunkIndex: input.chunkIndex,
    chunkHash,
    active: true,
    aliasesForIndex: input.aliasesForIndex,
  };
}

export function aliasEntriesFromTerms(input: {
  terms: string[];
  corpus: MtgKnowledgeCorpus;
  chunkId: string;
  sourceId: string;
}): Array<{ aliasHash: string; alias: string; normalizedAlias: string }> {
  const seen = new Set<string>();
  const out: Array<{ aliasHash: string; alias: string; normalizedAlias: string }> = [];

  for (const term of input.terms) {
    const normalizedAlias = normalizeAlias(term);
    if (!normalizedAlias || seen.has(normalizedAlias)) continue;
    seen.add(normalizedAlias);
    out.push({
      alias: term.trim(),
      normalizedAlias,
      aliasHash: aliasHashFromNormalized(normalizedAlias),
    });
  }

  return out;
}

/** Split any draft whose retrievalText exceeds the embedding model limit. */
export function fitDraftsForEmbedding(drafts: ChunkDraft[]): ChunkDraft[] {
  const out: ChunkDraft[] = [];

  for (const draft of drafts) {
    if (estimateTokenCount(draft.retrievalText) <= MAX_EMBED_TOKENS) {
      out.push(draft);
      continue;
    }

    const header = draft.retrievalText.slice(0, draft.retrievalText.length - draft.text.length).trim();
    const headerTokens = header ? estimateTokenCount(`${header}\n\n`) : 0;
    const bodyBudget = Math.max(512, MAX_EMBED_TOKENS - headerTokens);
    const pieces = splitToMaxEmbedSize(draft.text, bodyBudget);

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!;
      const retrievalText = header ? `${header}\n\n${piece}` : piece;
      out.push({
        ...draft,
        text: piece,
        retrievalText,
        sectionPath: `${draft.sectionPath}/part-${i}`,
        chunkIndex: draft.chunkIndex * 100 + i,
        chunkId: chunkIdFromParts([draft.sourceId, `${draft.sectionPath}/part-${i}`, sha256Hex(piece)]),
        chunkHash: sha256Hex(`${draft.sourceId}\0${draft.sectionPath}/part-${i}\0${piece}`),
        tokenCount: estimateTokenCount(piece),
        sourceLocator: `${draft.sourceLocator}#part-${i}`,
      });
    }
  }

  return out;
}
