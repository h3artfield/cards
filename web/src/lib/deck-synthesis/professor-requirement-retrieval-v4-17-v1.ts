/**
 * Professor v4.17 — requirement candidate retrieval with Slice 5.3 adaptive full-corpus cascade.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewRequirementV417, ResearchRequirementEvidenceV417 } from "./professor-brew-blueprint-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  rankEligibleCandidatesForRequirementV417,
  type RequirementCandidateEvaluationV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { buildResearchRequirementEvidenceV417 } from "./professor-blueprint-research-v4-17-v1";
import {
  adaptiveRetrieveCandidateInputsV417,
  createAdaptiveRetrievalBuildContextV417,
  diagnoseTailObjectiveExhaustionV417,
  evaluateRetrievedCandidateFunnelV417,
  objectiveTypeForRequirement,
  type AdaptiveRetrievalBuildContextV417,
  type CandidateSupplyTraceV417,
  type TailObjectiveExhaustionV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";

export const PROFESSOR_REQUIREMENT_RETRIEVAL_V4_17_V1_VERSION = "professor-requirement-retrieval-v4-17-v1";

export type RequirementRetrievalResultV417 = {
  requirementId: string;
  family: string;
  compiledQueryText: string;
  catalogScanned: number;
  prefiltered: number;
  evaluated: number;
  eligibleCount: number;
  topCandidates: RequirementCandidateEvaluationV417[];
  topEvaluationsSample: RequirementCandidateEvaluationV417[];
  researchEvidence: ResearchRequirementEvidenceV417;
  retrievalSource: "ADAPTIVE_FULL_CORPUS_V417";
  supplyTrace: CandidateSupplyTraceV417;
  tailExhaustion: TailObjectiveExhaustionV417 | null;
};

export function retrieveCandidatesForRequirementV417(args: {
  catalog: DeckResolutionCatalog;
  requirement: BrewRequirementV417;
  commanderColorIdentity: string[];
  maxScan?: number;
  maxEvaluate?: number;
  excludeOracleIds?: Set<string>;
  researchSeeds?: string[];
  buildContext?: AdaptiveRetrievalBuildContextV417;
  minQualityScore?: number;
}): RequirementRetrievalResultV417 {
  const compiled = compileRequirementSemanticQueryV417(args.requirement);
  const exclude = args.excludeOracleIds ?? new Set<string>();
  const buildContext = args.buildContext ?? createAdaptiveRetrievalBuildContextV417();
  const minQualityScore = args.minQualityScore ?? 40;

  const { inputs, trace: baseTrace } = adaptiveRetrieveCandidateInputsV417({
    catalog: args.catalog,
    commanderColorIdentity: args.commanderColorIdentity,
    objectiveId: args.requirement.requirementId,
    objectiveType: objectiveTypeForRequirement(args.requirement),
    functionalMatchToken: compiled.functionalMatchToken,
    probeFunctions: args.requirement.requiredFunctions,
    researchSeeds: args.researchSeeds,
    excludeOracleIds: exclude,
    boundedScan: args.maxScan,
    boundedEvaluate: args.maxEvaluate,
    buildContext,
  });

  let evaluations = inputs.map((candidate) =>
    evaluateCandidateAgainstRequirementV417({
      requirement: args.requirement,
      compiledQuery: compiled,
      candidate,
      commanderColorIdentity: args.commanderColorIdentity,
      catalog: args.catalog,
    }),
  );
  let ranked = rankEligibleCandidatesForRequirementV417(evaluations);
  if (ranked.length === 0) {
    const expanded = adaptiveRetrieveCandidateInputsV417({
      catalog: args.catalog,
      commanderColorIdentity: args.commanderColorIdentity,
      objectiveId: args.requirement.requirementId,
      objectiveType: objectiveTypeForRequirement(args.requirement),
      functionalMatchToken: compiled.functionalMatchToken,
      probeFunctions: args.requirement.requiredFunctions,
      researchSeeds: args.researchSeeds,
      excludeOracleIds: exclude,
      boundedScan: args.maxScan,
      boundedEvaluate: args.maxEvaluate,
      buildContext,
      requireFullCorpus: true,
    });
    evaluations = expanded.inputs.map((candidate) =>
      evaluateCandidateAgainstRequirementV417({
        requirement: args.requirement,
        compiledQuery: compiled,
        candidate,
        commanderColorIdentity: args.commanderColorIdentity,
        catalog: args.catalog,
      }),
    );
    ranked = rankEligibleCandidatesForRequirementV417(evaluations);
  }
  const supplyTrace = evaluateRetrievedCandidateFunnelV417({
    trace: buildContext.lastSupplyTrace ?? baseTrace,
    evaluations,
    minQualityScore,
    utilityByOracleId: new Map(ranked.map((e) => [e.oracleId, e.finalRequirementScore])),
  });
  const tailExhaustion =
    ranked.length === 0
      ? diagnoseTailObjectiveExhaustionV417({ trace: supplyTrace, requirement: args.requirement, minQualityScore })
      : null;
  if (tailExhaustion) {
    buildContext.lastTailExhaustion = tailExhaustion;
    buildContext.tailExhaustions.push(tailExhaustion);
  }
  buildContext.lastSupplyTrace = supplyTrace;

  const topEvaluationsSample = ranked.slice(0, 10);
  const researchEvidence = buildResearchRequirementEvidenceV417({
    requirementId: args.requirement.requirementId,
    family: args.requirement.family,
    evaluations: ranked,
  });

  return {
    requirementId: args.requirement.requirementId,
    family: args.requirement.family,
    compiledQueryText: compiled.compiledText,
    catalogScanned: supplyTrace.legalCorpusSize,
    prefiltered: inputs.length,
    evaluated: evaluations.length,
    eligibleCount: ranked.length,
    topCandidates: ranked.slice(0, 8),
    topEvaluationsSample,
    researchEvidence,
    retrievalSource: "ADAPTIVE_FULL_CORPUS_V417",
    supplyTrace,
    tailExhaustion,
  };
}

export function selectRequirementsForExecutionV417(
  requirements: BrewRequirementV417[],
): BrewRequirementV417[] {
  const sorted = [...requirements].sort((a, b) => b.priority - a.priority);
  const picks: BrewRequirementV417[] = [];
  const core = sorted.find((r) => r.packageIds.length > 0 && r.priority >= 90);
  if (core) picks.push(core);
  const infra = sorted.find((r) => ["INTERACTION", "ACCELERATION", "ACCESS"].includes(r.family) && !picks.includes(r));
  if (infra) picks.push(infra);
  const winProt = sorted.find(
    (r) => ["WIN_COMPONENT", "PROTECTION", "RECOVERY"].includes(r.family) && !picks.includes(r),
  );
  if (winProt) picks.push(winProt);
  for (const r of sorted) {
    if (picks.length >= 3) break;
    if (!picks.includes(r)) picks.push(r);
  }
  return picks.slice(0, 3);
}
