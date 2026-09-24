/**
 * Phase 6A.1 P14 metric helpers — shared between regression and changed-candidate reports.
 */
import type { FunctionalMatchType } from "../../src/lib/deck-synthesis/functional-match-v1";
import { matchTypeScore } from "../../src/lib/deck-synthesis/functional-match-v1";
import type { SemanticCandidateRetrievalReportV11 } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import type { IndependentCandidateLabel } from "./phase6a-calibration-v2-types";

export const P14_FUNCTION_STRATA = [
  "untap",
  "counter_synergy",
  "cast_from_exile",
  "recursion",
  "blink_flicker",
  "graveyard_setup",
  "mill",
  "token_generation",
  "card_draw",
  "ramp",
  "other",
] as const;

export type P14FunctionStratum = (typeof P14_FUNCTION_STRATA)[number];

export const POSITIVE_HUMAN_LABELS = new Set<IndependentCandidateLabel>([
  "STRONG_FIT",
  "VALID_ALTERNATIVE",
  "WEAK_BUT_DEFENSIBLE",
]);

export const STRONG_VALID_LABELS = new Set<IndependentCandidateLabel>(["STRONG_FIT", "VALID_ALTERNATIVE"]);

export function slugRequirementId(linkedSpecField: string): string {
  const [, token] = linkedSpecField.split(":");
  return (token ?? linkedSpecField).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

export function bestMatchForGoldRequirement(
  functionalMatches: Array<{ requirementId: string; matchType: FunctionalMatchType }>,
  linkedSpecFields: string[],
): { matchType: FunctionalMatchType; requirementId: string | null } {
  const tokenIds = linkedSpecFields.map(slugRequirementId);
  let best: { matchType: FunctionalMatchType; requirementId: string | null } = { matchType: "NONE", requirementId: null };
  for (const m of functionalMatches) {
    if (!tokenIds.includes(m.requirementId)) continue;
    if (matchTypeScore(m.matchType) > matchTypeScore(best.matchType)) {
      best = { matchType: m.matchType, requirementId: m.requirementId };
    }
  }
  return best;
}

export function functionStratum(requirementId: string, linkedFields: string[]): P14FunctionStratum {
  const blob = `${requirementId} ${linkedFields.join(" ")}`.toLowerCase();
  if (blob.includes("untap")) return "untap";
  if (blob.includes("counter_synergy") || (blob.includes("counter") && blob.includes("synergy"))) return "counter_synergy";
  if (blob.includes("cast_from_exile") || (blob.includes("exile") && blob.includes("cast"))) return "cast_from_exile";
  if (blob.includes("blink") || blob.includes("flicker")) return "blink_flicker";
  if (blob.includes("recursion") || blob.includes("reanimation")) return "recursion";
  if (blob.includes("graveyard_setup") || blob.includes("graveyard")) return "graveyard_setup";
  if (blob.includes("mill")) return "mill";
  if (blob.includes("token")) return "token_generation";
  if (blob.includes("draw")) return "card_draw";
  if (blob.includes("ramp") || blob.includes("mana")) return "ramp";
  return "other";
}

export function rankForGoldRequirement(
  report: SemanticCandidateRetrievalReportV11,
  linkedSpecFields: string[],
): SemanticCandidateRetrievalReportV11["candidates"] {
  return [...report.candidates].sort((a, b) => {
    const scoreA = matchTypeScore(bestMatchForGoldRequirement(a.functionalMatches, linkedSpecFields).matchType);
    const scoreB = matchTypeScore(bestMatchForGoldRequirement(b.functionalMatches, linkedSpecFields).matchType);
    return scoreB - scoreA || b.generalCandidateScore - a.generalCandidateScore || a.oracleId.localeCompare(b.oracleId);
  });
}

export function labelKey(caseId: string, requirementId: string, oracleId: string): string {
  return `${caseId}:${requirementId}:${oracleId}`;
}

export type TopKPrecisionResult = {
  precisionStrongValid: number | null;
  precisionViableIncludingWeak: number | null;
  labeledCountInTopK: number;
  topK: number;
};

export function topKHumanPrecision(
  rankedOracleIds: string[],
  k: number,
  labelByKey: Map<string, IndependentCandidateLabel>,
  caseId: string,
  requirementId: string,
): TopKPrecisionResult {
  const top = rankedOracleIds.slice(0, k);
  const labeled = top
    .map((oracleId) => ({ oracleId, label: labelByKey.get(labelKey(caseId, requirementId, oracleId)) }))
    .filter((x): x is { oracleId: string; label: IndependentCandidateLabel } => x.label != null);

  if (!labeled.length) {
    return { precisionStrongValid: null, precisionViableIncludingWeak: null, labeledCountInTopK: 0, topK: k };
  }

  const strongValid = labeled.filter((x) => STRONG_VALID_LABELS.has(x.label)).length;
  const viable = labeled.filter((x) => POSITIVE_HUMAN_LABELS.has(x.label)).length;
  return {
    precisionStrongValid: strongValid / labeled.length,
    precisionViableIncludingWeak: viable / labeled.length,
    labeledCountInTopK: labeled.length,
    topK: k,
  };
}

export function scoreSaturation(scores: number[]): {
  uniqueCount: number;
  total: number;
  saturated675Or700: number;
  saturationRate: number;
} {
  const rounded = scores.map((s) => Math.round(s * 1000) / 1000);
  const saturated675Or700 = rounded.filter((s) => s === 0.675 || s === 0.7).length;
  return {
    uniqueCount: new Set(rounded).size,
    total: scores.length,
    saturated675Or700,
    saturationRate: saturated675Or700 / Math.max(scores.length, 1),
  };
}
