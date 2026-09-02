import { lookupEmbeddedClerkKnowledge } from "./embedded-clerk-knowledge";
import {
  aliasCandidateTerms,
  getMtgKnowledgeChunksByIds,
  lookupMtgAliasesForTerms,
} from "./alias-store";
import { MTG_RAG_RETRIEVAL_LIMIT } from "./constants";
import { corporaForIntent } from "./corpus-for-intent";
import { vectorSearchMtgChunks } from "./chunk-retrieval";
import { lexicalRetrieveMtgCandidates } from "./lexical-candidate-retrieval";
import { finalizeHybridHitScores } from "./retrieval-ranking";
import type { MatchTier } from "./retrieval-match-tiers";
import type {
  MtgKnowledgeChunk,
  MtgKnowledgeCorpus,
  MtgQueryIntent,
} from "./types";

export type MtgRetrievalMethod = "alias_exact" | "lexical_exact" | "vector";

export interface MtgKnowledgeHit {
  chunk: MtgKnowledgeChunk;
  score: number;
  method: MtgRetrievalMethod;
  vectorDistance?: number;
  vectorSimilarity?: number;
  lexicalBoost?: number;
  finalScore?: number;
  matchTier?: MatchTier;
  rrfScore?: number;
  aliasSpecificity?: number;
}

export interface MtgHybridRetrievalResult {
  hits: MtgKnowledgeHit[];
  intent: MtgQueryIntent;
  corpora: MtgKnowledgeCorpus[];
  aliasMatches: number;
  lexicalMatches: number;
  vectorMatches: number;
}

export type HybridRetrievalMode =
  | "RULES"
  | "TERMINOLOGY"
  | "STRATEGY"
  | "COMMANDER_PRIMER"
  | "PACKAGE"
  | "INTERACTION";

function upsertHit(hits: MtgKnowledgeHit[], seen: Set<string>, hit: MtgKnowledgeHit): void {
  const existing = hits.find((h) => h.chunk.chunkId === hit.chunk.chunkId);
  if (existing) {
    if (hit.vectorSimilarity != null) {
      existing.vectorSimilarity = hit.vectorSimilarity;
      existing.vectorDistance = hit.vectorDistance;
    }
    if (existing.method !== "alias_exact" && hit.method === "vector") {
      existing.method = hit.method;
    }
    return;
  }
  seen.add(hit.chunk.chunkId);
  hits.push(hit);
}

export async function hybridRetrieveMtgKnowledge(input: {
  question: string;
  intent: MtgQueryIntent;
  corpora?: MtgKnowledgeCorpus[];
  mode?: HybridRetrievalMode;
  commanderName?: string;
  limit?: number;
}): Promise<MtgHybridRetrievalResult> {
  const limit = input.limit ?? MTG_RAG_RETRIEVAL_LIMIT;
  const corpora = input.corpora ?? corporaForIntent(input.intent);
  const hits: MtgKnowledgeHit[] = [];
  const seen = new Set<string>();

  for (const hit of lookupEmbeddedClerkKnowledge(input.question)) {
    upsertHit(hits, seen, hit);
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
      upsertHit(hits, seen, {
        chunk,
        score: 1,
        method: "alias_exact",
        finalScore: 1,
        vectorSimilarity: 1,
      });
    }
  }

  let lexicalMatches = 0;
  const lexicalChunks = await lexicalRetrieveMtgCandidates({
    question: input.question,
    corpora,
    commanderName: input.commanderName,
  });
  for (const chunk of lexicalChunks) {
    const before = seen.size;
    upsertHit(hits, seen, {
      chunk,
      score: 0,
      method: "lexical_exact",
    });
    if (seen.size > before) lexicalMatches++;
  }

  let vectorMatches = 0;
  const vectorHits = await vectorSearchMtgChunks({
    query: input.question,
    corpora,
    limit: limit * 2,
  });

  for (const vectorHit of vectorHits) {
    const before = seen.has(vectorHit.chunk.chunkId);
    upsertHit(hits, seen, {
      chunk: vectorHit.chunk,
      score: vectorHit.vectorSimilarity,
      method: "vector",
      vectorDistance: vectorHit.vectorDistance,
      vectorSimilarity: vectorHit.vectorSimilarity,
    });
    if (!before && seen.has(vectorHit.chunk.chunkId)) vectorMatches++;
  }

  const ranked =
    input.mode != null
      ? finalizeHybridHitScores({
          hits,
          query: input.question,
          mode: input.mode,
          intent: input.intent,
          commanderName: input.commanderName,
          limit,
        })
      : [...hits].sort((a, b) => (b.finalScore ?? b.score) - (a.finalScore ?? a.score));

  return {
    hits: ranked.slice(0, limit),
    intent: input.intent,
    corpora,
    aliasMatches: aliases.length,
    lexicalMatches,
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
