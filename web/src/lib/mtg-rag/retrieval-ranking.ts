import { aliasSpecificityMultiplier, shouldDemoteAliasExact } from "./alias-specificity";
import type { MtgKnowledgeHit } from "./hybrid-retrieval";
import {
  chunkSimilarity,
  extractQueryFacets,
  uncoveredFacetBonus,
} from "./query-facets";
import { extractLexicalRetrievalSignals } from "./retrieval-lexical-signals";
import {
  classifyHitMatchTier,
  higherTier,
  MATCH_TIER_PRIORITY,
  type MatchTier,
} from "./retrieval-match-tiers";
import type { MtgQueryIntent } from "./types";

export const MTG_RAG_RETRIEVAL_RANKING_VERSION = "mtg-rag-retrieval-ranking-v4";

type RetrievalRankingMode =
  | "RULES"
  | "TERMINOLOGY"
  | "STRATEGY"
  | "COMMANDER_PRIMER"
  | "PACKAGE"
  | "INTERACTION";

const RRF_K = 60;
const VECTOR_QUOTA_MIN = 2;
const VECTOR_QUOTA_STRONG_SIM = 0.45;
const MMR_LAMBDA = 0.72;

type ScoredHit = MtgKnowledgeHit & {
  matchTier: MatchTier;
  rrfScore: number;
  aliasSpecificity?: number;
};

function isIncidentalTier(tier: MatchTier): boolean {
  return (
    tier === "rule_body_incidental" ||
    tier === "glossary_body_incidental" ||
    tier === "commander_text_incidental" ||
    tier === "none"
  );
}

function isHighPriorityExactTier(tier: MatchTier): boolean {
  return (
    tier === "rule_citation_exact" ||
    tier === "glossary_title_exact" ||
    tier === "commander_field_exact"
  );
}

function computeRrfScore(rank: number, weight = 1): number {
  return weight / (RRF_K + rank + 1);
}

function tierPriorityForHit(
  hit: MtgKnowledgeHit,
  tier: MatchTier,
  input: { query: string; mode: RetrievalRankingMode },
): number {
  if (hit.method !== "alias_exact") return MATCH_TIER_PRIORITY[tier];

  const multiplier = aliasSpecificityMultiplier({
    query: input.query,
    mode: input.mode,
    chunk: hit.chunk,
  });

  if (shouldDemoteAliasExact({ query: input.query, mode: input.mode, chunk: hit.chunk })) {
    return MATCH_TIER_PRIORITY.glossary_body_incidental;
  }

  return Math.round(MATCH_TIER_PRIORITY.alias_exact * multiplier);
}

function fuseHits(input: {
  hits: MtgKnowledgeHit[];
  query: string;
  mode: RetrievalRankingMode;
  commanderName?: string;
}): ScoredHit[] {
  const signals = extractLexicalRetrievalSignals({
    query: input.query,
    commanderName: input.commanderName,
  });

  const classified = input.hits.map((hit) => ({
    hit,
    tier: classifyHitMatchTier(hit, signals),
  }));

  const vectorOrdered = classified
    .filter((x) => x.hit.method === "vector" && x.hit.vectorSimilarity != null)
    .sort((a, b) => (b.hit.vectorSimilarity ?? 0) - (a.hit.vectorSimilarity ?? 0));

  const lexicalOrdered = classified
    .filter((x) => x.hit.method === "lexical_exact" || x.hit.method === "alias_exact")
    .sort((a, b) => {
      const aPriority = tierPriorityForHit(a.hit, a.tier, input);
      const bPriority = tierPriorityForHit(b.hit, b.tier, input);
      return bPriority - aPriority || (b.hit.vectorSimilarity ?? 0) - (a.hit.vectorSimilarity ?? 0);
    });

  const fused = new Map<string, ScoredHit>();

  vectorOrdered.forEach((item, rank) => {
    const id = item.hit.chunk.chunkId;
    const existing = fused.get(id);
    const rrfScore = (existing?.rrfScore ?? 0) + computeRrfScore(rank, 1);
    const tierPriority = tierPriorityForHit(item.hit, item.tier, input);
    fused.set(id, {
      ...item.hit,
      matchTier: existing ? higherTier(existing.matchTier, item.tier) : item.tier,
      rrfScore,
      vectorSimilarity: item.hit.vectorSimilarity,
      lexicalBoost: tierPriority / 1_000_000,
      aliasSpecificity:
        item.hit.method === "alias_exact"
          ? aliasSpecificityMultiplier({ query: input.query, mode: input.mode, chunk: item.hit.chunk })
          : undefined,
      finalScore: rrfScore * 1_000 + tierPriority + (item.hit.vectorSimilarity ?? 0) * 100,
      score: 0,
    });
  });

  lexicalOrdered.forEach((item, rank) => {
    const id = item.hit.chunk.chunkId;
    const existing = fused.get(id);
    const rrfScore = (existing?.rrfScore ?? 0) + computeRrfScore(rank, 0.75);
    const tier = existing ? higherTier(existing.matchTier, item.tier) : item.tier;
    const tierPriority = tierPriorityForHit(item.hit, tier, input);
    fused.set(id, {
      ...item.hit,
      matchTier: tier,
      rrfScore,
      vectorSimilarity: existing?.vectorSimilarity ?? item.hit.vectorSimilarity,
      lexicalBoost: tierPriority / 1_000_000,
      aliasSpecificity:
        item.hit.method === "alias_exact"
          ? aliasSpecificityMultiplier({ query: input.query, mode: input.mode, chunk: item.hit.chunk })
          : undefined,
      finalScore:
        (existing?.rrfScore ?? rrfScore) * 1_000 +
        tierPriority +
        (existing?.vectorSimilarity ?? item.hit.vectorSimilarity ?? 0) * 100,
      score: 0,
    });
  });

  for (const item of classified) {
    if (fused.has(item.hit.chunk.chunkId)) continue;
    const tierPriority = tierPriorityForHit(item.hit, item.tier, input);
    fused.set(item.hit.chunk.chunkId, {
      ...item.hit,
      matchTier: item.tier,
      rrfScore: 0,
      lexicalBoost: tierPriority / 1_000_000,
      finalScore: tierPriority + (item.hit.vectorSimilarity ?? 0) * 100,
      score: 0,
    });
  }

  const ranked = [...fused.values()].map((hit) => ({
    ...hit,
    score: hit.finalScore ?? 0,
  }));

  ranked.sort((a, b) => {
    const scoreDiff = (b.finalScore ?? 0) - (a.finalScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.vectorSimilarity ?? 0) - (a.vectorSimilarity ?? 0);
  });

  if (signals.hasExplicitRuleReference) {
    const exact = ranked.filter((h) => h.matchTier === "rule_citation_exact");
    const rest = ranked.filter((h) => h.matchTier !== "rule_citation_exact");
    exact.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
    rest.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
    return [...exact, ...rest];
  }

  return ranked;
}

function selectTopKWithFacetDiversity(ranked: ScoredHit[], limit: number, query: string): ScoredHit[] {
  if (limit <= 0) return [];
  const queryFacets = extractQueryFacets(query);
  const selected: ScoredHit[] = [];
  const remaining = [...ranked];

  for (const hit of [...remaining]) {
    if (!isHighPriorityExactTier(hit.matchTier)) continue;
    selected.push(hit);
    remaining.splice(remaining.indexOf(hit), 1);
    if (selected.length >= limit) break;
  }

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.finalScore ?? 0;
      let maxSimilarity = 0;
      for (const picked of selected) {
        maxSimilarity = Math.max(maxSimilarity, chunkSimilarity(candidate.chunk, picked.chunk));
      }
      const facetBonus = uncoveredFacetBonus(candidate.chunk, selected.map((s) => s.chunk), queryFacets);
      const mmr =
        MMR_LAMBDA * relevance -
        (1 - MMR_LAMBDA) * maxSimilarity * 500_000 +
        facetBonus;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}

function enforceVectorQuota(ranked: ScoredHit[], selected: ScoredHit[], limit: number, query: string): ScoredHit[] {
  const queryFacets = extractQueryFacets(query);
  const result = [...selected];
  const vectorInTop = result.filter((h) => h.method === "vector").length;
  const strongVectors = ranked.filter(
    (h) => h.method === "vector" && (h.vectorSimilarity ?? 0) >= VECTOR_QUOTA_STRONG_SIM,
  );

  if (strongVectors.length === 0 || vectorInTop >= VECTOR_QUOTA_MIN) {
    return result.slice(0, limit);
  }

  const selectedIds = new Set(result.map((h) => h.chunk.chunkId));
  let needed = Math.min(VECTOR_QUOTA_MIN, strongVectors.length) - vectorInTop;

  for (const vectorHit of strongVectors) {
    if (needed <= 0) break;
    if (selectedIds.has(vectorHit.chunk.chunkId)) continue;

    const coveredFacets = new Set<string>();
    for (const hit of result) {
      for (const facet of extractQueryFacets(`${hit.chunk.citationLabel} ${hit.chunk.retrievalText}`)) {
        coveredFacets.add(facet);
      }
    }
    const vectorFacets = extractQueryFacets(
      `${vectorHit.chunk.citationLabel} ${vectorHit.chunk.retrievalText}`,
    );
    const addsFacet =
      queryFacets.length <= 1 ||
      vectorFacets.some((facet) => queryFacets.includes(facet) && !coveredFacets.has(facet));

    const dropIdx = result.reduce<number>((worstIdx, hit, idx) => {
      if (!isIncidentalTier(hit.matchTier) && hit.method !== "alias_exact") return worstIdx;
      if (hit.method === "alias_exact" && (hit.aliasSpecificity ?? 1) >= 0.5) return worstIdx;
      if (worstIdx < 0) return idx;
      if (addsFacet && hit.method === "vector") return worstIdx;
      return (hit.finalScore ?? 0) < (result[worstIdx].finalScore ?? 0) ? idx : worstIdx;
    }, -1);

    if (dropIdx < 0) break;
    result[dropIdx] = vectorHit;
    selectedIds.add(vectorHit.chunk.chunkId);
    needed--;
  }

  return result.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0)).slice(0, limit);
}

export function finalizeHybridHitScores(input: {
  hits: MtgKnowledgeHit[];
  query: string;
  mode: RetrievalRankingMode;
  intent: MtgQueryIntent;
  commanderName?: string;
  limit?: number;
}): MtgKnowledgeHit[] {
  const fused = fuseHits(input);
  const quotaLimit = input.limit ?? fused.length;
  const diversified = selectTopKWithFacetDiversity(fused, quotaLimit, input.query);
  return enforceVectorQuota(fused, diversified, quotaLimit, input.query);
}

/** @deprecated Tier-aware boost retained for trace compatibility only. */
export function computeLexicalBoost(): number {
  return 0;
}

export { selectTopKWithFacetDiversity, enforceVectorQuota };
