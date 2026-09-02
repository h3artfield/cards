/**
 * Archetype distinctness — merge, distance, hybrid detection.
 */
import type { EnginePatternDef } from "./archetype-discovery-types-v1";
import type { ScoredHypothesis } from "./commander-support-v1";

export const ARCHETYPE_MERGE_SIMILARITY_THRESHOLD = 0.92;
export const ARCHETYPE_DISTINCTNESS_MIN_DISTANCE = 0.15;

function primaryAxisOverlap(a: EnginePatternDef, b: EnginePatternDef): number {
  const shared = a.primaryAxes.filter((x) => b.primaryAxes.includes(x)).length;
  const denom = Math.max(a.primaryAxes.length, b.primaryAxes.length);
  return denom > 0 ? shared / denom : 0;
}

function vectorNorm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export function archetypeDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

export type MergedHypothesis = {
  primary: ScoredHypothesis;
  mergedInto: string[];
  subArchetypes: string[];
};

export function mergeMechanicallyRedundantHypotheses(
  hypotheses: ScoredHypothesis[],
): { merged: MergedHypothesis[]; duplicateRejections: Array<{ patternId: string; mergedInto: string; similarity: number }> } {
  const sorted = [...hypotheses].sort((a, b) => b.support.discoverySupport - a.support.discoverySupport);
  const merged: MergedHypothesis[] = [];
  const duplicateRejections: Array<{ patternId: string; mergedInto: string; similarity: number }> = [];
  const absorbed = new Set<string>();

  for (const hyp of sorted) {
    if (absorbed.has(hyp.pattern.patternId)) continue;
    if (!Number.isFinite(hyp.support.discoverySupport)) continue;

    const cluster: ScoredHypothesis[] = [hyp];
    for (const other of sorted) {
      if (other.pattern.patternId === hyp.pattern.patternId) continue;
      if (absorbed.has(other.pattern.patternId)) continue;
      if (!Number.isFinite(other.support.discoverySupport)) continue;
      if (vectorNorm(hyp.mechanicalVector) < 0.05 && vectorNorm(other.mechanicalVector) < 0.05) continue;

      const axisOverlap = primaryAxisOverlap(hyp.pattern, other.pattern);
      if (axisOverlap < 0.5) continue;

      const sim = cosineSimilarity(hyp.mechanicalVector, other.mechanicalVector);
      if (sim >= ARCHETYPE_MERGE_SIMILARITY_THRESHOLD) {
        cluster.push(other);
        absorbed.add(other.pattern.patternId);
        duplicateRejections.push({
          patternId: other.pattern.patternId,
          mergedInto: hyp.pattern.patternId,
          similarity: sim,
        });
      }
    }

    merged.push({
      primary: hyp,
      mergedInto: cluster.slice(1).map((c) => c.pattern.patternId),
      subArchetypes: cluster.slice(1).map((c) => c.pattern.mechanicalName),
    });
  }

  return { merged, duplicateRejections };
}

const HYBRID_CROSS_SUPPORT: Array<{
  primaryPatternId: string;
  secondaryPatternId: string;
  reason: string;
}> = [
  {
    primaryPatternId: "artifact_value_engine",
    secondaryPatternId: "sacrifice_death_trigger_engine",
    reason: "Commander rewards artifacts and sacrificing artifacts advances the same engine.",
  },
  {
    primaryPatternId: "token_swarm_engine",
    secondaryPatternId: "sacrifice_death_trigger_engine",
    reason: "Token production feeds sacrifice outlets and death-trigger payoffs.",
  },
  {
    primaryPatternId: "landfall_ramp_engine",
    secondaryPatternId: "token_swarm_engine",
    reason: "Landfall triggers often produce tokens or creature swarms.",
  },
  {
    primaryPatternId: "graveyard_recursion_engine",
    secondaryPatternId: "sacrifice_death_trigger_engine",
    reason: "Graveyard recursion and sacrifice death triggers share creature value chains.",
  },
  {
    primaryPatternId: "spellslinger_chain_engine",
    secondaryPatternId: "token_swarm_engine",
    reason: "Spell triggers can produce tokens as part of the same plan.",
  },
  {
    primaryPatternId: "exile_cast_engine",
    secondaryPatternId: "spellslinger_chain_engine",
    reason: "Cast-from-exile and spell chains reinforce the same impulse-advantage plan.",
  },
];

export function detectHybridArchetype(input: {
  surfacedPatternIds: string[];
  commanderProfile: { derivedRoles: Record<string, number> };
}): Array<{ primaryPatternId: string; secondaryPatternId: string; reason: string }> {
  const hybrids: Array<{ primaryPatternId: string; secondaryPatternId: string; reason: string }> = [];
  const surfaced = new Set(input.surfacedPatternIds);

  for (const rule of HYBRID_CROSS_SUPPORT) {
    if (!surfaced.has(rule.primaryPatternId) || !surfaced.has(rule.secondaryPatternId)) continue;
    hybrids.push(rule);
  }

  return hybrids.slice(0, 3);
}

export function nearestCompetingArchetypes(input: {
  targetVector: number[];
  candidates: Array<{ archetypeId: string; mechanicalName: string; vector: number[] }>;
  limit?: number;
}): Array<{ archetypeId: string; mechanicalName: string; archetypeDistance: number }> {
  return input.candidates
    .map((c) => ({
      archetypeId: c.archetypeId,
      mechanicalName: c.mechanicalName,
      archetypeDistance: archetypeDistance(input.targetVector, c.vector),
    }))
    .filter((c) => c.archetypeDistance >= ARCHETYPE_DISTINCTNESS_MIN_DISTANCE)
    .sort((a, b) => a.archetypeDistance - b.archetypeDistance)
    .slice(0, input.limit ?? 3);
}

export function patternsShareCardsButDistinct(a: EnginePatternDef, b: EnginePatternDef): boolean {
  if (a.patternId === b.patternId) return false;
  const overlap = a.primaryAxes.filter((x) => b.primaryAxes.includes(x));
  if (overlap.length === 0) return true;
  return a.chain.find((s) => s.stage === "PAYOFF")?.mechanic !== b.chain.find((s) => s.stage === "PAYOFF")?.mechanic;
}
