/**
 * Shared MTG Knowledge Service — single RAG entry for Clerk, Professor, and future consumers.
 * Wraps existing Firestore hybrid retrieval; does not duplicate vector logic.
 */
import {
  filterMtgKnowledgeHitsByResolvedCommanderPrimerScope,
  resolveCommanderPrimerScopeNames,
  shouldApplyResolvedCommanderPrimerScope,
} from "../mtg-rag/commander-primer-scope";
import { isMtgRagEnabled, MTG_RAG_RETRIEVAL_LIMIT } from "../mtg-rag/constants";
import { corporaForRetrievalMode } from "../mtg-rag/corpora-for-mode";
import {
  formatKnowledgeHitsForLlm,
  hybridRetrieveMtgKnowledge,
  type MtgHybridRetrievalResult,
  type MtgKnowledgeHit,
} from "../mtg-rag/hybrid-retrieval";
import { presentRetrievalTextForQuery } from "../mtg-rag/retrieval-text-presenter";
import { MTG_RAG_RETRIEVAL_RANKING_VERSION } from "../mtg-rag/retrieval-ranking";
import type { MtgKnowledgeCorpus, MtgQueryIntent } from "../mtg-rag/types";
import type { DeckIntelligenceConsumer, ProvenanceTier } from "./types";

export const MTG_KNOWLEDGE_SERVICE_VERSION = "mtg-knowledge-service-v5";

/** Professor-oriented retrieval modes — map to corpus filters and default limits. */
export type MtgKnowledgeRetrievalMode =
  | "RULES"
  | "TERMINOLOGY"
  | "STRATEGY"
  | "COMMANDER_PRIMER"
  | "PACKAGE"
  | "INTERACTION";

export type MtgKnowledgeEvidence = {
  chunkId: string;
  corpus: MtgKnowledgeCorpus;
  commander?: string;
  authorityTier: string;
  citationLabel: string;
  retrievalMethod: "alias_exact" | "lexical_exact" | "vector" | "embedded_clerk_glossary_fallback";
  score: number;
  vectorDistance?: number;
  vectorSimilarity?: number;
  lexicalBoost?: number;
  finalScore?: number;
  matchTier?: string;
  rrfScore?: number;
  aliasSpecificity?: number;
  provenanceTier: Extract<ProvenanceTier, "CURATED_KNOWLEDGE">;
  retrievalText: string;
  /** Retrieval mode under which this evidence entered Professor context (provenance). */
  mode?: MtgKnowledgeRetrievalMode;
};

export type MtgKnowledgeSearchRequest = {
  query: string;
  mode: MtgKnowledgeRetrievalMode;
  consumer: DeckIntelligenceConsumer;
  limit?: number;
  commanderName?: string;
  /** Resolved deck commanders — commander_primer chunks must match one of these when scope applies. */
  resolvedCommanderNames?: string[];
};

export type MtgKnowledgeSearchResult = {
  mode: MtgKnowledgeRetrievalMode;
  consumer: DeckIntelligenceConsumer;
  query: string;
  enabled: boolean;
  hits: MtgKnowledgeEvidence[];
  corpora: MtgKnowledgeCorpus[];
  aliasMatches: number;
  lexicalMatches: number;
  vectorMatches: number;
  retrievalRankingVersion?: string;
};

const MODE_CONFIG: Record<
  MtgKnowledgeRetrievalMode,
  { intent: MtgQueryIntent; corpora: MtgKnowledgeCorpus[]; defaultLimit: number }
> = {
  RULES: { intent: "rules_question", corpora: ["comprehensive_rules"], defaultLimit: 12 },
  TERMINOLOGY: { intent: "terminology_question", corpora: ["glossary"], defaultLimit: 6 },
  STRATEGY: { intent: "deckbuilding_education", corpora: ["youtube_transcript", "glossary"], defaultLimit: 8 },
  COMMANDER_PRIMER: {
    intent: "commander_strategy",
    corpora: ["commander_primer", "youtube_transcript"],
    defaultLimit: 8,
  },
  PACKAGE: {
    intent: "deckbuilding_education",
    corpora: ["youtube_transcript", "commander_primer", "glossary"],
    defaultLimit: 10,
  },
  INTERACTION: {
    intent: "mixed",
    corpora: ["comprehensive_rules", "glossary", "youtube_transcript"],
    defaultLimit: 10,
  },
};

/** Consumer-specific limit caps for bounded Professor tool loops. */
const CONSUMER_LIMIT_CAP: Partial<Record<DeckIntelligenceConsumer, number>> = {
  professor_planner: 12,
  store_clerk: MTG_RAG_RETRIEVAL_LIMIT,
};

function enrichQuery(input: MtgKnowledgeSearchRequest): string {
  const parts = [input.query.trim()];
  if (input.commanderName && input.mode === "COMMANDER_PRIMER") {
    parts.unshift(input.commanderName);
  }
  if (input.mode === "PACKAGE") {
    parts.push("package synergy enabler payoff");
  }
  if (input.mode === "INTERACTION") {
    parts.push("interaction rules stack");
  }
  return parts.filter(Boolean).join(" — ");
}

function hitToEvidence(hit: MtgKnowledgeHit, query: string): MtgKnowledgeEvidence {
  return {
    chunkId: hit.chunk.chunkId,
    corpus: hit.chunk.corpus,
    commander: hit.chunk.commander,
    authorityTier: hit.chunk.authorityTier,
    citationLabel: hit.chunk.citationLabel,
    retrievalMethod: hit.method,
    score: hit.finalScore ?? hit.score,
    vectorDistance: hit.vectorDistance,
    vectorSimilarity: hit.vectorSimilarity,
    lexicalBoost: hit.lexicalBoost,
    finalScore: hit.finalScore,
    matchTier: hit.matchTier,
    rrfScore: hit.rrfScore,
    aliasSpecificity: hit.aliasSpecificity,
    provenanceTier: "CURATED_KNOWLEDGE",
    retrievalText: presentRetrievalTextForQuery(hit.chunk, query),
  };
}

function emptyResult(input: MtgKnowledgeSearchRequest): MtgKnowledgeSearchResult {
  const cfg = MODE_CONFIG[input.mode];
  return {
    mode: input.mode,
    consumer: input.consumer,
    query: input.query,
    enabled: false,
    hits: [],
    corpora: cfg.corpora,
    aliasMatches: 0,
    lexicalMatches: 0,
    vectorMatches: 0,
  };
}

/**
 * Primary shared knowledge search — Clerk and Professor call this with different modes/limits.
 */
export async function searchMtgKnowledge(
  input: MtgKnowledgeSearchRequest,
): Promise<MtgKnowledgeSearchResult> {
  const cfg = MODE_CONFIG[input.mode];
  const cap = CONSUMER_LIMIT_CAP[input.consumer] ?? cfg.defaultLimit;
  const limit = Math.min(input.limit ?? cfg.defaultLimit, cap);
  const query = enrichQuery(input);

  if (!isMtgRagEnabled()) {
    return emptyResult(input);
  }

  const raw: MtgHybridRetrievalResult = await hybridRetrieveMtgKnowledge({
    question: query,
    intent: cfg.intent,
    corpora: corporaForRetrievalMode(input.mode),
    mode: input.mode,
    commanderName: input.commanderName,
    limit,
  });

  const resolvedCommanderNames = resolveCommanderPrimerScopeNames({
    resolvedCommanderNames: input.resolvedCommanderNames,
    commanderName: input.commanderName,
  });
  const scopedHits =
    shouldApplyResolvedCommanderPrimerScope(input.mode) && resolvedCommanderNames.length > 0
      ? filterMtgKnowledgeHitsByResolvedCommanderPrimerScope(raw.hits, resolvedCommanderNames).hits
      : raw.hits;

  return {
    mode: input.mode,
    consumer: input.consumer,
    query,
    enabled: true,
    hits: scopedHits.map((hit) => hitToEvidence(hit, query)),
    corpora: raw.corpora,
    aliasMatches: raw.aliasMatches,
    lexicalMatches: raw.lexicalMatches,
    vectorMatches: raw.vectorMatches,
    retrievalRankingVersion: MTG_RAG_RETRIEVAL_RANKING_VERSION,
  };
}

/** Format evidence for LLM context with explicit provenance headers. */
export function formatMtgKnowledgeEvidence(hits: MtgKnowledgeEvidence[]): string {
  if (hits.length === 0) return "(no knowledge chunks retrieved)";

  return hits
    .map((hit, i) =>
      [
        `[${i + 1}] ${hit.citationLabel}`,
        `corpus=${hit.corpus} authority=${hit.authorityTier} provenance=CURATED_KNOWLEDGE method=${hit.retrievalMethod}`,
        hit.retrievalText,
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

/** Legacy adapter — maps old MtgQueryIntent calls through shared service. */
export async function searchMtgKnowledgeByIntent(input: {
  query: string;
  intent: MtgQueryIntent;
  consumer: DeckIntelligenceConsumer;
  limit?: number;
}): Promise<MtgHybridRetrievalResult> {
  const modeFromIntent: Partial<Record<MtgQueryIntent, MtgKnowledgeRetrievalMode>> = {
    rules_question: "RULES",
    terminology_question: "TERMINOLOGY",
    color_identity_question: "TERMINOLOGY",
    commander_strategy: "COMMANDER_PRIMER",
    deckbuilding_education: "STRATEGY",
    mixed: "INTERACTION",
  };

  const mode = modeFromIntent[input.intent] ?? "STRATEGY";
  const result = await searchMtgKnowledge({
    query: input.query,
    mode,
    consumer: input.consumer,
    limit: input.limit,
  });

  return {
    hits: result.hits.map((h) => ({
      chunk: {
        chunkId: h.chunkId,
        corpus: h.corpus,
        authorityTier: h.authorityTier as MtgKnowledgeHit["chunk"]["authorityTier"],
        citationLabel: h.citationLabel,
        retrievalText: h.retrievalText,
      } as MtgKnowledgeHit["chunk"],
      score: h.score,
      method:
        h.retrievalMethod === "embedded_clerk_glossary_fallback"
          ? "vector"
          : h.retrievalMethod,
    })),
    intent: input.intent,
    corpora: result.corpora,
    aliasMatches: result.aliasMatches,
    lexicalMatches: result.lexicalMatches,
    vectorMatches: result.vectorMatches,
  };
}

export { formatKnowledgeHitsForLlm, hybridRetrieveMtgKnowledge };
