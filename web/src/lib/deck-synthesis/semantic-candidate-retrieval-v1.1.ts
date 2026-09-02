/**
 * Phase 6A.1 — Semantic Candidate Retrieval v1.1.
 * Typed FunctionalMatch semantics + requirement-specific ranking.
 * Pool recall preserved from v1; functional claims repaired.
 */
import { createHash } from "node:crypto";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { RetrievalSpecification } from "./archetype-discovery-types-v1";
import {
  aggregateFunctionalRoleFit,
  evaluateFunctionalMatch,
  matchTypeScore,
  rankCandidatesForRequirement,
  type FunctionalMatch,
  type FunctionalMatchType,
  FUNCTIONAL_MATCH_V1_VERSION,
} from "./functional-match-v1";
import {
  retrieveSemanticCandidates,
  SEMANTIC_CANDIDATE_RETRIEVAL_MODE,
  type SemanticCandidate,
  type SemanticCandidateRetrievalContext,
  type SemanticCandidateRetrievalReport,
  type SemanticCandidateRetrievalRequest,
} from "./semantic-candidate-retrieval-v1";

export const SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION = "semantic-candidate-retrieval-v1.1";

export type RequirementToken = {
  requirementId: string;
  requirementToken: string;
  linkedSpecField: string;
};

export type SemanticCandidateV11 = SemanticCandidate & {
  functionalMatches: FunctionalMatch[];
  rankForRequirement: Record<string, number>;
  rankOverall: number;
  generalCandidateScore: number;
  bestMatchType: FunctionalMatchType;
  falseExactFunctionClaim: boolean;
};

export type SemanticCandidateRetrievalReportV11 = Omit<SemanticCandidateRetrievalReport, "version" | "candidates"> & {
  version: typeof SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION;
  functionalMatchVersion: typeof FUNCTIONAL_MATCH_V1_VERSION;
  baseRetrievalVersion: string;
  candidates: SemanticCandidateV11[];
  requirementTokens: RequirementToken[];
};

function slugRequirementId(linkedSpecField: string): string {
  const [, token] = linkedSpecField.split(":");
  return (token ?? linkedSpecField).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

export function extractRequirementTokensFromSpec(spec: RetrievalSpecification): RequirementToken[] {
  const tokens: RequirementToken[] = [];
  const push = (linkedSpecField: string, token: string) => {
    const requirementId = slugRequirementId(linkedSpecField);
    if (tokens.some((t) => t.requirementId === requirementId && t.requirementToken === token)) return;
    tokens.push({ requirementId, requirementToken: token, linkedSpecField });
  };

  for (const fn of spec.requiredFunctions) push(`requiredFunctions:${fn}`, fn);
  for (const fn of spec.desiredFunctions) push(`desiredFunctions:${fn}`, fn);
  for (const input of spec.requiredInputs) push(`requiredInputs:${input}`, input);
  for (const output of spec.outputsToExploit) push(`outputsToExploit:${output}`, output);
  for (const resource of spec.resourcesToProduce) push(`resourcesToProduce:${resource}`, resource);
  for (const resource of spec.resourcesToConsume) push(`resourcesToConsume:${resource}`, resource);
  for (const state of spec.statesToMaintain) push(`statesToMaintain:${state}`, state);
  for (const state of spec.statesToIncrease) push(`statesToIncrease:${state}`, state);

  return tokens;
}

function mergeRetrievalSpecs(specs: RetrievalSpecification[]): RetrievalSpecification {
  const out: RetrievalSpecification = {
    requiredFunctions: [],
    desiredFunctions: [],
    requiredInputs: [],
    outputsToExploit: [],
    resourcesToProduce: [],
    resourcesToConsume: [],
    statesToMaintain: [],
    statesToIncrease: [],
    relevantCardTypes: [],
    relevantZones: [],
    protectionNeeds: [],
    redundancyNeeds: [],
    structuralNeeds: [],
    avoidFunctions: [],
    avoidCardClasses: [],
    selfPenaltyConditions: [],
    constructionConstraints: [],
  };
  for (const spec of specs) {
    out.selfPenaltyConditions.push(...spec.selfPenaltyConditions);
    for (const key of Object.keys(out) as (keyof RetrievalSpecification)[]) {
      if (key === "selfPenaltyConditions") continue;
      const acc = out[key] as string[];
      for (const v of spec[key] as string[]) {
        if (!acc.includes(v)) acc.push(v);
      }
    }
  }
  return out;
}

function evidenceDiscriminationBonus(matches: FunctionalMatch[]): number {
  let bonus = 0;
  for (const m of matches) {
    if (m.matchType === "EXACT") bonus += 0.035 * Math.min(m.evidenceRefs.length, 3);
    else if (m.matchType === "DIRECT_SUPPORT") bonus += 0.02 * Math.min(m.evidenceRefs.length, 2);
    else if (m.matchType === "INDIRECT_SUPPORT") bonus += 0.01;
  }
  return Math.min(bonus, 0.15);
}

function computeGeneralCandidateScore(candidate: SemanticCandidate, functionalRoleFit: number, matches: FunctionalMatch[]): number {
  const bonus = evidenceDiscriminationBonus(matches);
  return (
    0.25 * candidate.commanderSemanticFit +
    0.25 * candidate.directionFit +
    0.35 * functionalRoleFit +
    0.15 * candidate.structuralFit +
    bonus
  );
}

function enhanceCandidate(
  candidate: SemanticCandidate,
  catalog: DeckResolutionCatalog,
  requirementTokens: RequirementToken[],
): SemanticCandidateV11 {
  const card = catalog.byOracleId.get(candidate.oracleId);
  const oracleText = card?.oracleText ?? "";
  const typeLine = card?.typeLine ?? "";

  const functionalMatches = requirementTokens.map((req) =>
    evaluateFunctionalMatch({
      requirementId: req.requirementId,
      requirementToken: req.requirementToken,
      candidateOracleId: candidate.oracleId,
      oracleText,
      typeLine,
    }),
  );

  const functionalRoleFit = aggregateFunctionalRoleFit(functionalMatches);
  const bestMatchType = functionalMatches.reduce<FunctionalMatchType>(
    (best, m) => (matchTypeScore(m.matchType) > matchTypeScore(best) ? m.matchType : best),
    "NONE",
  );

  const hadRoleAliasClaim = candidate.functionalRoleFit >= 0.99;
  const falseExactFunctionClaim = hadRoleAliasClaim && functionalRoleFit < 0.5;

  return {
    ...candidate,
    functionalRoleFit,
    functionalMatches,
    rankForRequirement: {},
    rankOverall: 0,
    generalCandidateScore: computeGeneralCandidateScore(candidate, functionalRoleFit, functionalMatches),
    bestMatchType,
    falseExactFunctionClaim,
    evidenceRefs: [
      ...candidate.evidenceRefs,
      ...functionalMatches.flatMap((m) => m.evidenceRefs.map((e) => `functional:${m.requirementId}:${e}`)),
    ].slice(0, 16),
  };
}

function assignRanks(candidates: SemanticCandidateV11[], requirementTokens: RequirementToken[]): SemanticCandidateV11[] {
  const rankMaps = new Map<string, Map<string, number>>();
  for (const req of requirementTokens) {
    rankMaps.set(
      req.requirementId,
      rankCandidatesForRequirement(
        candidates.map((c) => ({ oracleId: c.oracleId, functionalMatches: c.functionalMatches })),
        req.requirementId,
      ),
    );
  }

  const sortedOverall = [...candidates].sort(
    (a, b) => b.generalCandidateScore - a.generalCandidateScore || a.oracleId.localeCompare(b.oracleId),
  );
  const overallRank = new Map(sortedOverall.map((c, i) => [c.oracleId, i + 1]));

  return candidates.map((c) => {
    const rankForRequirement: Record<string, number> = {};
    for (const req of requirementTokens) {
      rankForRequirement[req.requirementId] = rankMaps.get(req.requirementId)?.get(c.oracleId) ?? candidates.length;
    }
    return {
      ...c,
      rankForRequirement,
      rankOverall: overallRank.get(c.oracleId) ?? candidates.length,
    };
  });
}

export function retrieveSemanticCandidatesV11(
  request: SemanticCandidateRetrievalRequest,
  ctx: SemanticCandidateRetrievalContext,
): SemanticCandidateRetrievalReportV11 {
  const base = retrieveSemanticCandidates(request, ctx);
  const specs =
    request.retrievalSpecifications.length > 0
      ? request.retrievalSpecifications
      : request.buildDirections.filter((d) => d.phase6RetrievalReady).map((d) => d.retrievalSpecification);
  const mergedSpec = mergeRetrievalSpecs(specs);
  const requirementTokens = extractRequirementTokensFromSpec(mergedSpec);

  let candidates = base.candidates.map((c) => enhanceCandidate(c, ctx.catalog, requirementTokens));
  candidates = assignRanks(candidates, requirementTokens);

  return {
    ...base,
    version: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
    functionalMatchVersion: FUNCTIONAL_MATCH_V1_VERSION,
    baseRetrievalVersion: base.version,
    candidates,
    requirementTokens,
    candidatePoolHash: createHash("sha256")
      .update(JSON.stringify(candidates.map((c) => ({ id: c.oracleId, score: c.generalCandidateScore, fit: c.functionalRoleFit })).sort((a, b) => a.id.localeCompare(b.id))))
      .digest("hex"),
  };
}

export function getCandidatesForRequirement(
  report: SemanticCandidateRetrievalReportV11,
  requirementId: string,
): SemanticCandidateV11[] {
  return [...report.candidates].sort(
    (a, b) =>
      (a.rankForRequirement[requirementId] ?? Number.MAX_SAFE_INTEGER) -
      (b.rankForRequirement[requirementId] ?? Number.MAX_SAFE_INTEGER),
  );
}

export function getAlternativesForFunctionV11(
  report: SemanticCandidateRetrievalReportV11,
  requirementToken: string,
  excludeOracleId?: string,
): SemanticCandidateV11[] {
  const req = report.requirementTokens.find((r) => r.requirementToken === requirementToken);
  if (!req) return [];
  return getCandidatesForRequirement(report, req.requirementId).filter(
    (c) => c.oracleId !== excludeOracleId && matchTypeScore(c.bestMatchType) > 0,
  );
}

export function findSemanticCandidatesV11(
  request: SemanticCandidateRetrievalRequest,
  ctx: SemanticCandidateRetrievalContext,
): SemanticCandidateRetrievalReportV11 {
  return retrieveSemanticCandidatesV11(request, ctx);
}
