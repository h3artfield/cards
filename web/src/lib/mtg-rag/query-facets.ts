import type { MtgKnowledgeChunk } from "./types";

export type QueryFacet = string;

const FACET_TERMS: Record<string, string[]> = {
  damage: ["damage", "marked", "wound", "injury"],
  destroy: ["destroy", "destruction", "destroyed"],
  exile: ["exile", "exiled", "exiling"],
  draw: ["draw", "draws", "drawn"],
  wheel: ["wheel", "wheels"],
  combat: ["combat", "attack", "attacker", "block", "blocking"],
  graveyard: ["graveyard", "graveyards"],
  sacrifice: ["sacrifice", "sacrifices", "sacrificed"],
  counter: ["counter", "counters", "counterspell"],
  token: ["token", "tokens"],
  planeswalker: ["planeswalker", "loyalty"],
  commander: ["commander", "command zone"],
  priority: ["priority", "stack"],
  life: ["life", "life total"],
  hand: ["hand", "discard"],
  legend: ["legend", "legendary"],
  replacement: ["replacement", "prevent", "prevention", "redirect"],
  layer: ["layer", "layers", "timestamp"],
  mill: ["mill", "library"],
  regenerate: ["regenerate", "regeneration"],
};

export function extractQueryFacets(query: string): QueryFacet[] {
  const lower = query.toLowerCase();
  return Object.entries(FACET_TERMS)
    .filter(([, terms]) => terms.some((term) => lower.includes(term)))
    .map(([facet]) => facet);
}

export function chunkFacets(chunk: MtgKnowledgeChunk): Set<QueryFacet> {
  const text = `${chunk.citationLabel}\n${chunk.sectionTitle ?? ""}\n${chunk.retrievalText}`.toLowerCase();
  const facets = new Set<QueryFacet>();

  for (const [facet, terms] of Object.entries(FACET_TERMS)) {
    if (terms.some((term) => text.includes(term))) facets.add(facet);
  }

  if (chunk.ruleNumberStart) {
    facets.add(`rule:${chunk.ruleNumberStart.split(".")[0]}`);
  }
  if (chunk.corpus) facets.add(`corpus:${chunk.corpus}`);

  return facets;
}

export function facetOverlap(a: Set<QueryFacet>, b: Set<QueryFacet>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const facet of a) {
    if (b.has(facet)) shared++;
  }
  return shared / Math.max(a.size, b.size);
}

export function chunkSimilarity(a: MtgKnowledgeChunk, b: MtgKnowledgeChunk): number {
  const facetSim = facetOverlap(chunkFacets(a), chunkFacets(b));
  const sameCitation = a.citationLabel === b.citationLabel ? 1 : 0;
  const sameRuleSection =
    a.ruleNumberStart && b.ruleNumberStart && a.ruleNumberStart.split(".")[0] === b.ruleNumberStart.split(".")[0]
      ? 0.8
      : 0;
  return Math.max(facetSim, sameCitation, sameRuleSection);
}

export function uncoveredFacetBonus(
  candidate: MtgKnowledgeChunk,
  selected: MtgKnowledgeChunk[],
  queryFacets: QueryFacet[],
): number {
  if (queryFacets.length <= 1 || selected.length === 0) return 0;

  const candidateFacets = chunkFacets(candidate);
  const covered = new Set<QueryFacet>();
  for (const chunk of selected) {
    for (const facet of chunkFacets(chunk)) covered.add(facet);
  }

  let bonus = 0;
  for (const facet of queryFacets) {
    if (!candidateFacets.has(facet)) continue;
    if (!covered.has(facet)) bonus += 250_000;
  }
  return bonus;
}
