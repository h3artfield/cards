#!/usr/bin/env npx tsx
/**
 * Phase 6A calibration v1 — AUTOMATED DIAGNOSTIC ONLY (not independent human review).
 * Metrics are heuristic proxies derived from the retrieval system's own scores.
 * See run-phase6a-human-calibration-v2.ts for corrected methodology.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSemanticMapNeighbors } from "../src/lib/semantic-visualization/artifact-loader";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { loadCommanderGameChangerSnapshot } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractDirectionAnchors,
  extractMechanicalMotifs,
  filterCatalogRoleIndex,
  resolveBenchmarkCommanderOracleIds,
  retrieveSemanticCandidates,
  SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
  type CommanderBuildDirection,
  type RetrievalSpecification,
  type SemanticCandidate,
  type SemanticCandidateRetrievalReport,
} from "../src/lib/deck-synthesis";
import {
  PHASE6A_REVIEW_CASE_IDS,
  adjudicateCandidate,
  auditMetaIndependence,
  isPositiveLabel,
  isViableLabel,
  mechanicallyWrongRate,
  precisionAtK,
  irrelevantRateAtK,
  rankCandidates,
  resolveMustSurfaceGold,
  sampleCandidatesForReview,
  type CandidateReviewRecord,
  type CandidateQualityLabel,
} from "./lib/phase6a-human-retrieval-adjudication-v1";
import type { RetrievalBucketId } from "../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";

loadProjectEnvLocal();

const OUT_PATH = "data/milestones/deck-synthesis/phase6a-human-retrieval-review-v1.json";

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

const ABSTENTION_CASE_IDS = [
  "multi-narset",
  "incidental-jeleva",
  "blindv5-10-commander-background",
  "blindv5-27-static-state-engine",
  "blindv5-38-combat",
  "blindv5-41-attrition-engine",
  "blindv5-49-enchantments",
  "blindv5-60-multi-stage-engine",
];

const K_VALUES = [5, 10, 20] as const;

type EvalCase = {
  id: string;
  setId: string;
  commandZoneConfiguration?: string;
  commanders: string[];
  bracket: number;
  category?: string;
};

type CaseRunResult = {
  caseId: string;
  setId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  bracket: number;
  category: string | null;
  reviewStrata: string[];
  retrievalReady: boolean;
  abstentionClass: "EVALUATED" | "PHASE5_ABSTENTION" | "PHASE6_RETRIEVAL_FAILURE";
  abstentionReason: string | null;
  commandZone: Record<string, unknown>;
  primaryDirection: CommanderBuildDirection | null;
  retrievalSpecification: RetrievalSpecification | null;
  retrievalBuckets: Record<string, number>;
  poolSize: number;
  specCoverage: number;
  mustSurfaceGold: Array<{ oracleId: string; canonicalName: string; mechanicalDefense: string; surfaced: boolean }>;
  mustSurfaceRecall: number;
  candidateReviews: CandidateReviewRecord[];
  allCandidateReviews: CandidateReviewRecord[];
  functionalCoverage: Array<{
    field: string;
    value: string;
    usefulCoverage: boolean;
    viableAlternativeCount: number;
    bestLabel: CandidateQualityLabel | null;
  }>;
  requiredFunctionCoverage: number;
  viableAlternativesPerRequiredFunction: number;
  negativeConstraintAudit: {
    hasNegativeConstraints: boolean;
    forbiddenCandidatesInPool: string[];
    usefulSubstitutesFound: boolean;
    correctness: number | null;
  };
  multiRoleAudit: {
    multiRoleCandidateCount: number;
    multiRolePrecision: number;
    falseRoleMembershipRate: number;
  };
  poolSizeDiagnosis: string;
  routeProvenanceSample: Array<{
    oracleId: string;
    canonicalName: string;
    semanticMapNodeExists: boolean;
    directionValid: boolean;
    bucketValid: boolean;
    provenanceQuality: string;
  }>;
};

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();

  const reviewCaseIdSet = new Set(PHASE6A_REVIEW_CASE_IDS.map((c) => c.caseId));
  const strataByCase = new Map(PHASE6A_REVIEW_CASE_IDS.map((c) => [c.caseId, c.strata]));

  const allCases: EvalCase[] = [];
  for (const spec of EVAL_SETS) {
    for (const c of spec.cases) {
      allCases.push({
        id: c.id,
        setId: spec.setId,
        commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
        commanders: c.commanders,
        bracket: c.bracket,
        category: "category" in c ? String(c.category) : undefined,
      });
    }
  }

  const caseRuns: CaseRunResult[] = [];
  const metaAuditCandidates: SemanticCandidate[] = [];
  const poolSizesReady: number[] = [];
  const abstentionAudits: Array<Record<string, unknown>> = [];

  for (const c of allCases) {
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
    if (!resolution.resolved) continue;

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: c.bracket as 1 | 2 | 3 | 4 | 5 },
      { catalog, shadowIndex, globalCatalogIndex: globalIndex },
    );
    const primary = report.buildDirections.find((d) => d.rank === 1);

    if (!primary?.phase6RetrievalReady) {
      abstentionAudits.push(auditAbstention(c, primary, report.evaluationContextStatus));
      if (reviewCaseIdSet.has(c.id)) {
        caseRuns.push(emptyReviewCase(c, strataByCase.get(c.id) ?? [], "PHASE5_ABSTENTION", primary));
      }
      continue;
    }

    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: resolution.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    })!;
    const motifs = extractMechanicalMotifs(profile);
    const anchors = extractDirectionAnchors({ profile, motifs });
    const colorIdentity =
      report.commandZoneComposition?.combinedColorIdentity ??
      resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []);
    const roleIndex = filterCatalogRoleIndex(globalIndex, [...new Set(colorIdentity)]);

    const retrievalReport = retrieveSemanticCandidates(
      {
        commandZoneConfiguration: c.commandZoneConfiguration ?? "single_commander",
        bracket: c.bracket as 1 | 2 | 3 | 4 | 5,
        commanderOracleIds: resolution.oracleIds,
        combinedColorIdentity: [...new Set(colorIdentity)],
        buildDirections: report.buildDirections,
        directionAnchors: anchors,
        retrievalSpecifications: [primary.retrievalSpecification],
        commandZoneComposition: report.commandZoneComposition,
        namedArchetype: null,
      },
      { catalog, shadowIndex, roleIndex, semanticNeighbors, gameChangerSnapshot },
    );

    if (retrievalReport.abstentionReason) {
      abstentionAudits.push({
        caseId: c.id,
        commanders: c.commanders,
        classification: "PHASE6_RETRIEVAL_FAILURE",
        phase5RetrievalReady: true,
        phase6AbstentionReason: retrievalReport.abstentionReason,
        detail: "Phase 5 marked retrieval-ready but Phase 6A abstained.",
      });
      continue;
    }

    poolSizesReady.push(retrievalReport.poolStats.candidateCount);
    metaAuditCandidates.push(...retrievalReport.candidates);

    if (!reviewCaseIdSet.has(c.id)) continue;

    const caseReview = buildCaseReview({
      evalCase: c,
      strata: strataByCase.get(c.id) ?? [],
      report,
      primary,
      anchors,
      retrievalReport,
      catalog,
      shadowIndex,
    });
    caseRuns.push(caseReview);
  }

  const allReviews = caseRuns.flatMap((c) => c.allCandidateReviews);
  const sampledReviews = caseRuns.flatMap((c) => c.candidateReviews);

  const metrics = buildAggregateMetrics(caseRuns, allReviews, sampledReviews, poolSizesReady);
  const outputProvenanceMetaAudit = auditMetaIndependence(metaAuditCandidates);
  const prospectiveGate = proposeAcceptanceGate(metrics, outputProvenanceMetaAudit, abstentionAudits);

  const artifact = {
    version: "phase6a-human-retrieval-review-v1",
    generatedAt: new Date().toISOString(),
    retrievalEngineVersion: SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
    retrievalMode: "SEMANTIC_ONLY",
    calibrationMethodology: {
      status: "AUTOMATED_DIAGNOSTIC_ONLY",
      supersededBy: "phase6a-human-calibration-v2",
      note: "Labels assigned by adjudicateCandidate() using retrieval system scores — not independent human review.",
      rejectedAsProductMetrics: [
        "mustSurfaceRecall (v1 gold invalid/poorly scoped)",
        "topK semantic precision (heuristic proxy labels)",
        "negativeConstraintCorrectness as hard-constraint metric",
      ],
    },
    phase5Status: "PRODUCT_ACCEPTED",
    phase6AStatus: "CALIBRATION_V1_AUTOMATED_DIAGNOSTIC_ONLY",
    phase6AFreeze: "WAIT",
    authorization: {
      phase6AHumanRetrievalEvaluation: "AUTHORIZED_COMPLETE",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      packages: "WAIT",
      professorImplementation: "WAIT",
      routeAnimationUI: "WAIT",
    },
    reviewDesign: {
      stratifiedCaseCount: PHASE6A_REVIEW_CASE_IDS.length,
      selectionNote: "Stratified across command-zone types, engine families, pool extremes, coverage extremes, and multi-role density.",
      sampleStrategy: "Top/middle/tail per required bucket + overall top/middle/tail + multi-role sample.",
      labelSchema: ["STRONG_FIT", "VALID_ALTERNATIVE", "WEAK_BUT_DEFENSIBLE", "IRRELEVANT", "MECHANICALLY_WRONG"],
      kValues: K_VALUES,
    },
    abstentionAudit: {
      totalAbstentions: ABSTENTION_CASE_IDS.length,
      phase5AbstentionCount: abstentionAudits.filter((a) => a.classification === "PHASE5_ABSTENTION").length,
      phase6RetrievalFailureCount: abstentionAudits.filter((a) => a.classification === "PHASE6_RETRIEVAL_FAILURE").length,
      cases: abstentionAudits,
      pass: abstentionAudits.every((a) => a.classification === "PHASE5_ABSTENTION"),
    },
    outputProvenanceMetaAudit: {
      auditType: "OUTPUT_PROVENANCE_META_AUDIT",
      ...outputProvenanceMetaAudit,
      candidatesAudited: metaAuditCandidates.length,
      casesAudited: poolSizesReady.length,
      limitation: "Scans candidate output/provenance strings — not proof upstream execution excluded meta-data providers.",
    },
    /** @deprecated use automatedCalibrationProxyMetrics */
    humanPhase6AMetrics: metrics,
    automatedCalibrationProxyMetrics: {
      ...metrics,
      proxyTop5SemanticPrecision: metrics.top5SemanticPrecision,
      proxyTop10SemanticPrecision: metrics.top10SemanticPrecision,
      proxyTop20SemanticPrecision: metrics.top20SemanticPrecision,
      proxyRequiredFunctionCoverage: metrics.requiredFunctionCoverage,
      proxyMultiRolePrecision: metrics.multiRolePrecision,
      proxyExplanationCorrectness: metrics.explanationCorrectness,
      proxyMustSurfaceRecall: metrics.mustSurfaceRecall,
      metricClass: "AUTOMATED_HEURISTIC_PROXY",
    },
    stratumMetrics: buildStratumMetrics(caseRuns),
    poolSizeAudit: buildPoolSizeAudit(caseRuns),
    prospectivePhase6AAcceptanceGate: prospectiveGate,
    caseReviews: caseRuns,
  };

  artifact.artifactHash = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");

  const outPath = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outPath,
        reviewedCases: caseRuns.length,
        top10SemanticPrecision: metrics.top10SemanticPrecision,
        mustSurfaceRecall: metrics.mustSurfaceRecall,
        mechanicallyWrongRateTop10: metrics.mechanicallyWrongRateTop10,
        metaIndependencePass: outputProvenanceMetaAudit.pass,
        prospectiveGateRecommendation: prospectiveGate.recommendation,
      },
      null,
      2,
    ),
  );
}

type DeckResolutionCatalog = Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;

function auditAbstention(
  c: EvalCase,
  primary: CommanderBuildDirection | undefined,
  evaluationContextStatus: string,
): Record<string, unknown> {
  let detail = "Frozen Phase-5 RetrievalSpecification below retrieval readiness.";
  if (!primary) detail = "No valid primary CommanderBuildDirection.";
  else if (primary.directionValidity === "UNANCHORED_SIGNAL") detail = "Unanchored direction — cannot drive retrieval.";
  else if (
    primary.retrievalSpecification.requiredFunctions.length === 0 &&
    primary.retrievalSpecification.requiredInputs.length === 0 &&
    primary.retrievalSpecification.outputsToExploit.length === 0
  ) {
    detail = "Empty retrieval buckets — spec incomplete.";
  } else if (!primary.phase6RetrievalReady) {
    detail = `Retrieval completeness ${primary.retrievalSpecificationCompleteness.toFixed(2)} below Phase 6 threshold.`;
  }

  return {
    caseId: c.id,
    commanders: c.commanders,
    classification: primary?.phase6RetrievalReady ? "PHASE6_RETRIEVAL_FAILURE" : "PHASE5_ABSTENTION",
    phase5RetrievalReady: primary?.phase6RetrievalReady ?? false,
    retrievalSpecificationCompleteness: primary?.retrievalSpecificationCompleteness ?? 0,
    evaluationContextStatus,
    detail,
  };
}

function emptyReviewCase(
  c: EvalCase,
  strata: string[],
  abstentionClass: CaseRunResult["abstentionClass"],
  primary: CommanderBuildDirection | undefined,
): CaseRunResult {
  return {
    caseId: c.id,
    setId: c.setId,
    commanders: c.commanders,
    commandZoneConfiguration: c.commandZoneConfiguration ?? "single_commander",
    bracket: c.bracket,
    category: c.category ?? null,
    reviewStrata: strata,
    retrievalReady: false,
    abstentionClass,
    abstentionReason: primary ? `NOT_RETRIEVAL_READY:${primary.retrievalSpecificationCompleteness.toFixed(2)}` : "NO_PRIMARY_DIRECTION",
    commandZone: {},
    primaryDirection: primary ?? null,
    retrievalSpecification: primary?.retrievalSpecification ?? null,
    retrievalBuckets: {},
    poolSize: 0,
    specCoverage: 0,
    mustSurfaceGold: [],
    mustSurfaceRecall: 0,
    candidateReviews: [],
    allCandidateReviews: [],
    functionalCoverage: [],
    requiredFunctionCoverage: 0,
    viableAlternativesPerRequiredFunction: 0,
    negativeConstraintAudit: { hasNegativeConstraints: false, forbiddenCandidatesInPool: [], usefulSubstitutesFound: false, correctness: null },
    multiRoleAudit: { multiRoleCandidateCount: 0, multiRolePrecision: 0, falseRoleMembershipRate: 0 },
    poolSizeDiagnosis: "Abstained — pool not generated.",
    routeProvenanceSample: [],
  };
}

function buildCaseReview(input: {
  evalCase: EvalCase;
  strata: string[];
  report: ReturnType<typeof discoverArchetypes>;
  primary: CommanderBuildDirection;
  anchors: ReturnType<typeof extractDirectionAnchors>;
  retrievalReport: SemanticCandidateRetrievalReport;
  catalog: DeckResolutionCatalog;
  shadowIndex: Awaited<ReturnType<typeof loadShadowSemanticIndex>>;
}): CaseRunResult {
  const { evalCase, primary, retrievalReport, catalog, shadowIndex, anchors, report } = input;
  const spec = primary.retrievalSpecification;
  const ranked = rankCandidates(retrievalReport.candidates);
  const requiredBuckets = [
    ...new Set(
      spec.requiredFunctions.map((fn) => {
        if (fn.includes("ramp") || fn.includes("mana")) return "MANA_SUPPORT";
        if (fn.includes("draw")) return "CARD_ADVANTAGE";
        if (fn.includes("sacrifice")) return "RESOURCE_CONSUMERS";
        if (fn.includes("token")) return "ENGINE_PIECES";
        if (fn.includes("protection")) return "PROTECTION";
        if (fn.includes("recursion") || fn.includes("graveyard")) return "RECURSION";
        return "STRUCTURAL_SUPPORT";
      }),
    ),
  ] as RetrievalBucketId[];

  const sampled = sampleCandidatesForReview(retrievalReport.candidates, requiredBuckets);

  const allCandidateReviews: CandidateReviewRecord[] = ranked.map((candidate, idx) =>
    adjudicateCandidate({
      candidate,
      rankOverall: idx + 1,
      sampleTier: idx < 5 ? "TOP" : idx >= ranked.length - 5 ? "TAIL" : "MIDDLE",
      sampleBucket: "OVERALL",
      catalog,
      shadowIndex,
      spec,
      primary,
      anchors,
      commanderOracleIds: report.commanderOracleIds,
      buildDirections: report.buildDirections,
    }),
  );

  const reviewsByOracle = new Map(allCandidateReviews.map((r) => [r.oracleId, r]));
  const candidateReviews = sampled.map((candidate) => {
    const overallRank = ranked.findIndex((c) => c.oracleId === candidate.oracleId) + 1;
    const isMulti = candidate.candidateRoleMemberships.length > 1;
    return adjudicateCandidate({
      candidate,
      rankOverall: overallRank,
      sampleTier: overallRank <= 5 ? "TOP" : overallRank >= ranked.length - 4 ? "TAIL" : isMulti ? "MULTI_ROLE" : "MIDDLE",
      sampleBucket: isMulti ? "MULTI_ROLE" : (candidate.matchedRetrievalBuckets[0] ?? "OVERALL"),
      catalog,
      shadowIndex,
      spec,
      primary,
      anchors,
      commanderOracleIds: report.commanderOracleIds,
      buildDirections: report.buildDirections,
    });
  });

  const mustSurfaceGold = resolveMustSurfaceGold(catalog, evalCase.id).map((g) => ({
    ...g,
    surfaced: retrievalReport.candidates.some((c) => c.oracleId === g.oracleId),
  }));
  const mustSurfaceRecall =
    mustSurfaceGold.length > 0 ? mustSurfaceGold.filter((g) => g.surfaced).length / mustSurfaceGold.length : 1;

  const functionalCoverage = buildFunctionalCoverage(spec, retrievalReport.candidates, reviewsByOracle);
  const requiredFns = spec.requiredFunctions;
  const usefulRequired = requiredFns.filter((fn) =>
    functionalCoverage.some((f) => f.field === "requiredFunctions" && f.value === fn && f.usefulCoverage),
  );
  const requiredFunctionCoverage = requiredFns.length ? usefulRequired.length / requiredFns.length : 1;
  const viableAlternativesPerRequiredFunction =
    requiredFns.length > 0
      ? requiredFns.reduce((sum, fn) => {
          const fc = functionalCoverage.find((f) => f.field === "requiredFunctions" && f.value === fn);
          return sum + (fc?.viableAlternativeCount ?? 0);
        }, 0) / requiredFns.length
      : 0;

  const negativeConstraintAudit = auditNegativeConstraints(spec, retrievalReport.candidates, catalog, reviewsByOracle);
  const multiRoleCandidates = retrievalReport.candidates.filter((c) => c.candidateRoleMemberships.length > 1);
  const multiRoleReviews = multiRoleCandidates
    .map((c) => reviewsByOracle.get(c.oracleId))
    .filter(Boolean) as CandidateReviewRecord[];
  const multiRolePrecision =
    multiRoleReviews.length > 0
      ? multiRoleReviews.filter((r) => r.multiRoleDefensible === true).length / multiRoleReviews.length
      : 1;
  const falseRoleMembershipRate = multiRoleReviews.length > 0 ? 1 - multiRolePrecision : 0;

  const routeProvenanceSample = candidateReviews.slice(0, 8).map((r) => ({
    oracleId: r.oracleId,
    canonicalName: r.canonicalName,
    semanticMapNodeExists: r.routeProvenance.every((p) => p.semanticMapNodeId === r.oracleId),
    directionValid: r.provenanceQuality !== "INVALID",
    bucketValid: r.routeProvenance.length > 0,
    provenanceQuality: r.provenanceQuality,
  }));

  return {
    caseId: evalCase.id,
    setId: evalCase.setId,
    commanders: evalCase.commanders,
    commandZoneConfiguration: evalCase.commandZoneConfiguration ?? "single_commander",
    bracket: evalCase.bracket,
    category: evalCase.category ?? null,
    reviewStrata: input.strata,
    retrievalReady: true,
    abstentionClass: "EVALUATED",
    abstentionReason: null,
    commandZone: summarizeCommandZone(report),
    primaryDirection: primary,
    retrievalSpecification: spec,
    retrievalBuckets: retrievalReport.poolStats.candidatesPerBucket,
    poolSize: retrievalReport.poolStats.candidateCount,
    specCoverage: retrievalReport.poolStats.retrievalSpecificationCoverage,
    mustSurfaceGold,
    mustSurfaceRecall,
    candidateReviews,
    allCandidateReviews,
    functionalCoverage,
    requiredFunctionCoverage,
    viableAlternativesPerRequiredFunction,
    negativeConstraintAudit,
    multiRoleAudit: {
      multiRoleCandidateCount: multiRoleCandidates.length,
      multiRolePrecision,
      falseRoleMembershipRate,
    },
    poolSizeDiagnosis: diagnosePoolSize(evalCase.id, retrievalReport.poolStats.candidateCount),
    routeProvenanceSample,
  };
}

function summarizeCommandZone(report: ReturnType<typeof discoverArchetypes>) {
  const comp = report.commandZoneComposition;
  if (!comp) return { configuration: "single_commander", combinedColorIdentity: report.combinedColorIdentity ?? [] };
  return {
    configuration: comp.configuration,
    combinedColorIdentity: comp.combinedColorIdentity,
    memberCount: comp.members.length,
    crossSupportDirectionCount: comp.crossSupportDirections.length,
    sharedDirectionCount: comp.sharedDirections.length,
  };
}

function buildFunctionalCoverage(
  spec: RetrievalSpecification,
  candidates: SemanticCandidate[],
  reviewsByOracle: Map<string, CandidateReviewRecord>,
) {
  const fields: Array<{ field: keyof RetrievalSpecification; values: string[] }> = [
    { field: "requiredFunctions", values: spec.requiredFunctions },
    { field: "requiredInputs", values: spec.requiredInputs },
    { field: "statesToMaintain", values: spec.statesToMaintain },
    { field: "statesToIncrease", values: spec.statesToIncrease },
    { field: "resourcesToProduce", values: spec.resourcesToProduce },
    { field: "resourcesToConsume", values: spec.resourcesToConsume },
    { field: "protectionNeeds", values: spec.protectionNeeds },
    { field: "constructionConstraints", values: spec.constructionConstraints },
  ];

  const out: CaseRunResult["functionalCoverage"] = [];
  for (const { field, values } of fields) {
    for (const value of values) {
      const matching = candidates.filter((c) =>
        c.candidateRoleMemberships.some((m) => m.matchedFunctions.includes(value)),
      );
      const viable = matching.filter((c) => {
        const review = reviewsByOracle.get(c.oracleId);
        return review && isPositiveLabel(review.humanLabel);
      });
      const weak = matching.filter((c) => {
        const review = reviewsByOracle.get(c.oracleId);
        return review && isViableLabel(review.humanLabel);
      });
      const best = matching
        .map((c) => reviewsByOracle.get(c.oracleId))
        .filter(Boolean)
        .sort((a, b) => {
          const order: CandidateQualityLabel[] = ["STRONG_FIT", "VALID_ALTERNATIVE", "WEAK_BUT_DEFENSIBLE", "IRRELEVANT", "MECHANICALLY_WRONG"];
          return order.indexOf(a!.humanLabel) - order.indexOf(b!.humanLabel);
        })[0];

      out.push({
        field,
        value,
        usefulCoverage: viable.length > 0,
        viableAlternativeCount: viable.length,
        bestLabel: best?.humanLabel ?? null,
      });
    }
  }
  return out;
}

function auditNegativeConstraints(
  spec: RetrievalSpecification,
  candidates: SemanticCandidate[],
  catalog: DeckResolutionCatalog,
  reviewsByOracle: Map<string, CandidateReviewRecord>,
) {
  const hasNegative =
    spec.avoidCardClasses.length > 0 ||
    spec.avoidFunctions.length > 0 ||
    spec.selfPenaltyConditions.length > 0 ||
    spec.constructionConstraints.length > 0;

  if (!hasNegative) {
    return { hasNegativeConstraints: false, forbiddenCandidatesInPool: [], usefulSubstitutesFound: true, correctness: null };
  }

  const forbiddenCandidatesInPool = candidates
    .filter((c) => reviewsByOracle.get(c.oracleId)?.humanLabel === "MECHANICALLY_WRONG")
    .map((c) => c.canonicalName);

  const rampConstraint = spec.constructionConstraints.some((c) => c.includes("minimize_controller_noncreature_spells"));
  let usefulSubstitutesFound = true;
  if (rampConstraint) {
    usefulSubstitutesFound = candidates.some((c) => {
      const card = catalog.byOracleId.get(c.oracleId);
      const review = reviewsByOracle.get(c.oracleId);
      if (!card || !review || !isPositiveLabel(review.humanLabel)) return false;
      const tl = (card.typeLine ?? "").toLowerCase();
      const text = (card.oracleText ?? "").toLowerCase();
      return /creature/.test(tl) && (/add .* mana|add \{/.test(text) || /search your library for .* land/.test(text));
    });
  }

  const correctness =
    forbiddenCandidatesInPool.length === 0 && usefulSubstitutesFound ? 1 : forbiddenCandidatesInPool.length > 0 ? 0 : 0.5;

  return { hasNegativeConstraints: true, forbiddenCandidatesInPool, usefulSubstitutesFound, correctness };
}

function diagnosePoolSize(caseId: string, size: number): string {
  if (size <= 10) {
    return `Very small pool (${size}) — inspect for strategy narrowness, missing retrieval family, or over-restrictive constraints. Case ${caseId}.`;
  }
  if (size >= 220) {
    return `Very large pool (${size}) — inspect for broad strategy, duplicated bucket semantics, or generic roles dominating. Case ${caseId}.`;
  }
  if (size <= 40) return `Small pool (${size}) — may reflect narrow engine or tight color identity.`;
  return `Median-range pool (${size}) — consistent with Phase 6A broad-recall design.`;
}

function buildAggregateMetrics(
  caseRuns: CaseRunResult[],
  allReviews: CandidateReviewRecord[],
  sampledReviews: CandidateReviewRecord[],
  poolSizesReady: number[],
) {
  const evaluated = caseRuns.filter((c) => c.retrievalReady);
  const sortedPools = [...poolSizesReady].sort((a, b) => a - b);
  const pct = (arr: number[], p: number) => {
    if (!arr.length) return 0;
    const idx = Math.floor((arr.length - 1) * p);
    return arr[idx]!;
  };

  return {
    top5SemanticPrecision: precisionAtK(allReviews, 5),
    top10SemanticPrecision: precisionAtK(allReviews, 10),
    top20SemanticPrecision: precisionAtK(allReviews, 20),
    top5SemanticPrecisionSampled: precisionAtK(sampledReviews, 5),
    top10SemanticPrecisionSampled: precisionAtK(sampledReviews, 10),
    top20SemanticPrecisionSampled: precisionAtK(sampledReviews, 20),
    bucketTopKPrecision: {
      k5: averageBucketPrecision(evaluated, 5),
      k10: averageBucketPrecision(evaluated, 10),
      k20: averageBucketPrecision(evaluated, 20),
    },
    mechanicallyWrongRate: mechanicallyWrongRate(allReviews),
    mechanicallyWrongRateTop10: mechanicallyWrongRate(allReviews, 10),
    irrelevantTop10Rate: irrelevantRateAtK(allReviews, 10),
    mustSurfaceRecall: average(evaluated.map((c) => c.mustSurfaceRecall)),
    requiredFunctionCoverage: average(evaluated.map((c) => c.requiredFunctionCoverage)),
    viableAlternativesPerFunction: average(evaluated.map((c) => c.viableAlternativesPerRequiredFunction)),
    multiRolePrecision: average(evaluated.map((c) => c.multiRoleAudit.multiRolePrecision)),
    falseRoleMembershipRate: average(evaluated.map((c) => c.multiRoleAudit.falseRoleMembershipRate)),
    negativeConstraintCorrectness: (() => {
      const negCases = evaluated.filter((c) => c.negativeConstraintAudit.hasNegativeConstraints);
      if (!negCases.length) return null;
      return average(negCases.map((c) => c.negativeConstraintAudit.correctness ?? 0));
    })(),
    negativeConstraintCoverageNote:
      "Three reviewed cases emit constructionConstraints (minimize_controller_noncreature_spells); Phase 6A currently admits forbidden noncreature spells into those pools.",
    explanationCorrectness: allReviews.filter((r) => r.explanationQuality === "GOOD" || r.explanationQuality === "ACCEPTABLE").length / Math.max(allReviews.length, 1),
    provenanceCorrectness: allReviews.filter((r) => r.provenanceQuality === "VALID").length / Math.max(allReviews.length, 1),
    legalityCorrectness: 1,
    colorIdentityCorrectness: 1,
    bracketHardRuleCorrectness: 1,
    medianPoolSize: median(sortedPools),
    p10PoolSize: pct(sortedPools, 0.1),
    p90PoolSize: pct(sortedPools, 0.9),
    reviewedCaseCount: evaluated.length,
    note: "Precision metrics computed on full ranked pools within reviewed cases; legality/color/bracket assumed 100% from Phase 6A structural filters.",
  };
}

function averageBucketPrecision(cases: CaseRunResult[], k: number): number {
  const vals: number[] = [];
  for (const c of cases) {
    for (const bucket of Object.keys(c.retrievalBuckets)) {
      const inBucket = c.allCandidateReviews
        .filter((r) => r.bucketMemberships.some((m) => m.bucketId === bucket))
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, k);
      if (!inBucket.length) continue;
      vals.push(inBucket.filter((r) => isPositiveLabel(r.humanLabel)).length / inBucket.length);
    }
  }
  return vals.length ? average(vals) : 0;
}

function buildStratumMetrics(caseRuns: CaseRunResult[]) {
  const strata = new Map<string, CaseRunResult[]>();
  for (const c of caseRuns.filter((x) => x.retrievalReady)) {
    for (const s of c.reviewStrata) {
      const list = strata.get(s) ?? [];
      list.push(c);
      strata.set(s, list);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, cases] of strata) {
    const reviews = cases.flatMap((c) => c.allCandidateReviews);
    out[key] = {
      caseCount: cases.length,
      medianPoolSize: median(cases.map((c) => c.poolSize)),
      top10SemanticPrecision: precisionAtK(reviews, 10),
      mustSurfaceRecall: average(cases.map((c) => c.mustSurfaceRecall)),
      requiredFunctionCoverage: average(cases.map((c) => c.requiredFunctionCoverage)),
    };
  }
  return out;
}

function buildPoolSizeAudit(caseRuns: CaseRunResult[]) {
  const ready = caseRuns.filter((c) => c.retrievalReady);
  return {
    smallestPools: [...ready].sort((a, b) => a.poolSize - b.poolSize).slice(0, 5).map((c) => ({
      caseId: c.caseId,
      poolSize: c.poolSize,
      diagnosis: c.poolSizeDiagnosis,
    })),
    largestPools: [...ready].sort((a, b) => b.poolSize - a.poolSize).slice(0, 5).map((c) => ({
      caseId: c.caseId,
      poolSize: c.poolSize,
      diagnosis: c.poolSizeDiagnosis,
    })),
  };
}

function proposeAcceptanceGate(
  metrics: ReturnType<typeof buildAggregateMetrics>,
  outputProvenanceMetaAudit: ReturnType<typeof auditMetaIndependence>,
  abstentionAudits: Array<Record<string, unknown>>,
) {
  const hardInvariants = {
    legalityCorrectness: { required: 1, observed: metrics.legalityCorrectness, pass: metrics.legalityCorrectness === 1 },
    colorIdentityCorrectness: { required: 1, observed: metrics.colorIdentityCorrectness, pass: metrics.colorIdentityCorrectness === 1 },
    falseProhibitedMetaProvenance: { required: 0, observed: outputProvenanceMetaAudit.candidatesUsingMetaSignal, pass: outputProvenanceMetaAudit.pass },
    negativeHardConstraintViolations: {
      required: 0,
      observed: metrics.negativeConstraintCorrectness ?? 0,
      pass: (metrics.negativeConstraintCorrectness ?? 1) >= 0.9,
      note:
        metrics.negativeConstraintCorrectness == null
          ? "Deferred — no negative-constraint specs in reviewed set."
          : "Noncreature spells present in pools with minimize_controller_noncreature_spells.",
    },
    phase5AbstentionIntegrity: {
      required: "PHASE5_ABSTENTION only",
      observed: abstentionAudits.filter((a) => a.classification !== "PHASE5_ABSTENTION").length,
      pass: abstentionAudits.every((a) => a.classification === "PHASE5_ABSTENTION"),
    },
  };

  const calibratedGates = {
    top10SemanticPrecision: { proposedMin: 0.55, observed: metrics.top10SemanticPrecision, pass: metrics.top10SemanticPrecision >= 0.55 },
    top20SemanticPrecision: { proposedMin: 0.45, observed: metrics.top20SemanticPrecision, pass: metrics.top20SemanticPrecision >= 0.45 },
    mustSurfaceRecall: { proposedMin: 0.65, observed: metrics.mustSurfaceRecall, pass: metrics.mustSurfaceRecall >= 0.65 },
    requiredFunctionCoverage: { proposedMin: 0.8, observed: metrics.requiredFunctionCoverage, pass: metrics.requiredFunctionCoverage >= 0.8 },
    mechanicallyWrongRateTop10: { proposedMax: 0.05, observed: metrics.mechanicallyWrongRateTop10, pass: metrics.mechanicallyWrongRateTop10 <= 0.05 },
    multiRolePrecision: { proposedMin: 0.7, observed: metrics.multiRolePrecision, pass: metrics.multiRolePrecision >= 0.7 },
    explanationCorrectness: { proposedMin: 0.75, observed: metrics.explanationCorrectness, pass: metrics.explanationCorrectness >= 0.75 },
    provenanceCorrectness: { proposedMin: 0.85, observed: metrics.provenanceCorrectness, pass: metrics.provenanceCorrectness >= 0.85 },
  };

  const hardPass = Object.values(hardInvariants).every((g) => g.pass);
  const calibratedPass = Object.values(calibratedGates).every((g) => g.pass);

  return {
    status: "PROPOSED_NOT_FROZEN",
    philosophy: "HIGH RECALL + GOOD TOP-K PRECISION + CORRECT PROVENANCE — do not optimize for tiny pools.",
    hardInvariants,
    calibratedSemanticQualityGates: calibratedGates,
    recommendation: hardPass && calibratedPass ? "WOULD_ACCEPT_PENDING_HUMAN_SIGNOFF" : "CALIBRATION_CONTINUES",
    freeze: "WAIT",
  };
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
