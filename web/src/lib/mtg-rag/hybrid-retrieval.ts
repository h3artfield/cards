import { lookupEmbeddedClerkKnowledge } from "./embedded-clerk-knowledge";
import {
  aliasCandidateTerms,
  getMtgKnowledgeChunksByIds,
  lookupMtgAliasesForTerms,
} from "./alias-store";
import { MTG_RAG_RETRIEVAL_LIMIT } from "./constants";
import { corporaForIntent } from "./corpus-for-intent";
import { vectorSearchMtgChunks } from "./chunk-retrieval";
import type {
  MtgKnowledgeAuthorityTier,
  MtgKnowledgeChunk,
  MtgKnowledgeCorpus,
  MtgQueryIntent,
} from "./types";

export type MtgRetrievalMethod = "alias_exact" | "vector";

export interface MtgKnowledgeHit {
  chunk: MtgKnowledgeChunk;
  score: number;
  method: MtgRetrievalMethod;
}

export interface MtgHybridRetrievalResult {
  hits: MtgKnowledgeHit[];
  intent: MtgQueryIntent;
  corpora: MtgKnowledgeCorpus[];
  aliasMatches: number;
  vectorMatches: number;
}

const AUTHORITY_RANK: Record<MtgKnowledgeAuthorityTier, number> = {
  live_canonical_data: 5,
  official_rules: 4,
  curated_internal: 3,
  community_education: 1,
};

function rankHits(hits: MtgKnowledgeHit[]): MtgKnowledgeHit[] {
  return [...hits].sort((a, b) => {
    const authDiff =
      AUTHORITY_RANK[b.chunk.authorityTier] - AUTHORITY_RANK[a.chunk.authorityTier];
    if (authDiff !== 0) return authDiff;
    const methodDiff = (a.method === "alias_exact" ? 1 : 0) - (b.method === "alias_exact" ? 1 : 0);
    if (methodDiff !== 0) return methodDiff;
    return b.score - a.score;
  });
}

export async function hybridRetrieveMtgKnowledge(input: {
  question: string;
  intent: MtgQueryIntent;
  limit?: number;
}): Promise<MtgHybridRetrievalResult> {
  const limit = input.limit ?? MTG_RAG_RETRIEVAL_LIMIT;
  const corpora = corporaForIntent(input.intent);
  const hits: MtgKnowledgeHit[] = [];
  const seen = new Set<string>();

  for (const hit of lookupEmbeddedClerkKnowledge(input.question)) {
    if (seen.has(hit.chunk.chunkId)) continue;
    seen.add(hit.chunk.chunkId);
    hits.push(hit);
  }

  const aliasTerms = aliasCandidateTerms(input.question);
  const aliases = await lookupMtgAliasesForTerms(aliasTerms);
  const aliasCorpusOk = new Set(corpora);

  if (aliases.length > 0) {
    const aliasChunks = await getMtgKnowledgeChunksByIds(
      aliases.map((a) => a.chunkId),
    );
    for (const chunk of aliasChunks) {
      if (!aliasCorpusOk.has(chunk.corpus)) continue;
      if (seen.has(chunk.chunkId)) continue;
      seen.add(chunk.chunkId);
      hits.push({ chunk, score: 1, method: "alias_exact" });
    }
  }

  let vectorMatches = 0;
  if (hits.length < limit) {
    const vectorHits = await vectorSearchMtgChunks({
      query: input.question,
      corpora,
      limit: limit * 2,
    });

    for (const chunk of vectorHits) {
      if (seen.has(chunk.chunkId)) continue;
      seen.add(chunk.chunkId);
      vectorMatches++;
      hits.push({ chunk, score: 0.75, method: "vector" });
    }
  }

  return {
    hits: rankHits(hits).slice(0, limit),
    intent: input.intent,
    corpora,
    aliasMatches: aliases.length,
    vectorMatches,
  };
}

export function formatKnowledgeHitsForLlm(hits: MtgKnowledgeHit[]): string {
  if (hits.length === 0) return "(no knowledge chunks retrieved)";

  return hits
    .map((hit, i) => {
      const c = hit.chunk;
      return [
        `[${i + 1}] ${c.citationLabel} (${c.corpus}, ${c.authorityTier}, via ${hit.method})`,
        c.retrievalText,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}
