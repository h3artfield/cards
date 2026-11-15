#!/usr/bin/env npx tsx
/**
 * Phase 6A Human Calibration v2.
 * Outputs: calibration summary, blinded reviewer packets, post-hoc scores (separate).
 * No retriever tuning.
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
import { BENCHMARK_COMMANDER_LEGALITY_VERSION } from "../src/lib/deck-synthesis/benchmark-commander-legality-v1.1";
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
  type SemanticCandidate,
} from "../src/lib/deck-synthesis";
import {
  PHASE6A_REVIEW_CASE_IDS,
  adjudicateCandidate,
  rankCandidates,
} from "./lib/phase6a-human-retrieval-adjudication-v1";
import { getCalibrationCaseIds, preflightCaseGold } from "./lib/phase6a-calibration-v2-gold";
import {
  aggregateFunctionalRecall,
  evaluateExactCardSentinelRecall,
  evaluateFunctionalSemanticRecall,
} from "./lib/phase6a-calibration-v2-functional-recall";
import {
  auditAllUpstreamNegativeSpecs,
  classifyConstraintSeverity,
  isNoncreatureSpellCard,
} from "./lib/phase6a-calibration-v2-constraints";
import {
  buildBlindedReviewArtifacts,
  outputProvenanceMetaAudit,
} from "./lib/phase6a-calibration-v2-review-packets";
import {
  buildSpecCorrectionOverlayEntries,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_VERSION,
} from "./lib/phase6a-calibration-v2-spec-overlay";
import type { BlindedReviewPacket, PostHocScoreRecord } from "./lib/phase6a-calibration-v2-types";

loadProjectEnvLocal();

const OUT_PATH = "data/milestones/deck-synthesis/phase6a-human-calibration-v2.json";
const BLINDED_PATH = "data/milestones/deck-synthesis/phase6a-human-calibration-v2-reviewer-blinded.json";
const POST_HOC_PATH = "data/milestones/deck-synthesis/phase6a-human-calibration-v2-post-hoc-scores.json";

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();

  const reviewCaseIds = new Set(getCalibrationCaseIds());
  const strataByCase = new Map(PHASE6A_REVIEW_CASE_IDS.map((c) => [c.caseId, c.strata]));

  const metaCandidates: SemanticCandidate[] = [];
  const poolSizesReady: number[] = [];
  const upstreamSpecInputs: Array<{
    caseId: string;
    commanders: string[];
    commanderOracleIds: string[];
    spec: CommanderBuildDirection["retrievalSpecification"];
  }> = [];
  const abstentionAudits: Array<Record<string, unknown>> = [];
  const caseCalibrations: Array<Record<string, unknown>> = [];
  const allBlindedPackets: BlindedReviewPacket[] = [];
  const allPostHocScores: PostHocScoreRecord[] = [];

  let globalGoldSealingBlocked = false;
  const globalGoldSealingBlockReasons: string[] = [];

  for (const spec of EVAL_SETS) {
    for (const c of spec.cases) {
      const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
      if (!resolution.resolved) continue;

      const report = discoverArchetypes(
        { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
        { catalog, shadowIndex, globalCatalogIndex: globalIndex },
      );
      const primary = report.buildDirections.find((d) => d.rank === 1);

      if (!primary?.phase6RetrievalReady) {
        abstentionAudits.push({
          caseId: c.id,
          commanders: c.commanders,
          classification: "PHASE5_ABSTENTION",
          detail: primary ? `Completeness ${primary.retrievalSpecificationCompleteness.toFixed(2)}` : "No primary direction",
        });
        continue;
      }

      upstreamSpecInputs.push({
        caseId: c.id,
        commanders: c.commanders,
        commanderOracleIds: resolution.oracleIds,
        spec: primary.retrievalSpecification,
      });

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
      const combinedColorIdentity = [...new Set(colorIdentity)];
      const roleIndex = filterCatalogRoleIndex(globalIndex, combinedColorIdentity);

      const retrievalReport = retrieveSemanticCandidates(
        {
          commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
          bracket: c.bracket,
          commanderOracleIds: resolution.oracleIds,
          combinedColorIdentity,
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
          classification: "PHASE6_RETRIEVAL_FAILURE",
          phase6AbstentionReason: retrievalReport.abstentionReason,
        });
        continue;
      }

      poolSizesReady.push(retrievalReport.poolStats.candidateCount);
      metaCandidates.push(...retrievalReport.candidates);

      if (!reviewCaseIds.has(c.id)) continue;

      const goldPreflight = preflightCaseGold({
        caseId: c.id,
        spec: primary.retrievalSpecification,
        catalog,
        combinedColorIdentity,
        bracket: c.bracket,
        gameChangerSnapshot,
      });

      if (goldPreflight.goldSealingBlocked) {
        globalGoldSealingBlocked = true;
        globalGoldSealingBlockReasons.push(...goldPreflight.goldSealingBlockReasons.map((r) => `${c.id}: ${r}`));
      }

      const functionalResults = evaluateFunctionalSemanticRecall({
        requirements: goldPreflight.functionalSemanticRequirements,
        candidates: retrievalReport.candidates,
        catalog,
        shadowIndex,
      });
      const functionalAgg = aggregateFunctionalRecall(functionalResults);
      const sentinelRecall = evaluateExactCardSentinelRecall(goldPreflight.sentinelPreflight, retrievalReport.candidates);

      const proxyLabels = new Map<string, string>();
      const ranked = rankCandidates(retrievalReport.candidates);
      for (let i = 0; i < ranked.length; i++) {
        const proxy = adjudicateCandidate({
          candidate: ranked[i]!,
          rankOverall: i + 1,
          sampleTier: "TOP",
          sampleBucket: "OVERALL",
          catalog,
          shadowIndex,
          spec: primary.retrievalSpecification,
          primary,
          anchors,
          commanderOracleIds: resolution.oracleIds,
          buildDirections: report.buildDirections,
        });
        proxyLabels.set(ranked[i]!.oracleId, proxy.automatedProxyLabel ?? proxy.humanLabel);
      }

      const { blindedPackets, postHocScores } = buildBlindedReviewArtifacts({
        caseId: c.id,
        commanders: c.commanders,
        commanderOracleIds: resolution.oracleIds,
        commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
        combinedColorIdentity,
        bracket: c.bracket,
        primary,
        requirements: goldPreflight.functionalSemanticRequirements,
        candidates: retrievalReport.candidates,
        catalog,
        shadowIndex,
        automatedProxyLabels: proxyLabels,
      });
      allBlindedPackets.push(...blindedPackets);
      allPostHocScores.push(...postHocScores);

      const typedConstraints = [
        ...primary.retrievalSpecification.constructionConstraints.map((raw) => ({
          raw,
          typedSeverity: classifyConstraintSeverity(raw),
        })),
        ...primary.retrievalSpecification.avoidCardClasses.map((raw) => ({
          raw,
          typedSeverity: classifyConstraintSeverity(`avoid_${raw}`),
        })),
      ];

      const densityConstraint = typedConstraints.find((t) => t.raw.includes("minimize_controller_noncreature_spells"));
      let densityAudit: Record<string, unknown> | null = null;
      if (densityConstraint) {
        const noncreatureInPool = retrievalReport.candidates.filter((cand) => {
          const card = catalog.byOracleId.get(cand.oracleId);
          return card && isNoncreatureSpellCard(card.typeLine ?? "");
        }).length;
        densityAudit = {
          typedSeverity: densityConstraint.typedSeverity,
          note: "DENSITY_TARGET — not equivalent to banning every noncreature spell.",
          noncreatureSpellCountInPool: noncreatureInPool,
          poolSize: retrievalReport.poolStats.candidateCount,
          noncreatureSpellRate: noncreatureInPool / Math.max(retrievalReport.poolStats.candidateCount, 1),
        };
      }

      caseCalibrations.push({
        caseId: c.id,
        setId: spec.setId,
        commanders: c.commanders,
        commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
        bracket: c.bracket,
        reviewStrata: strataByCase.get(c.id) ?? [],
        poolSize: retrievalReport.poolStats.candidateCount,
        specCoverage: retrievalReport.poolStats.retrievalSpecificationCoverage,
        retrievalBuckets: retrievalReport.poolStats.candidatesPerBucket,
        evaluationDimensions: {
          automatedFunctionalCoverageProxy: {
            primary: true,
            results: functionalResults,
            ...functionalAgg,
            note: "Deterministic oracle regex + ShadowSemanticIndex derived roles — not human adjudication.",
          },
          exactCardSentinelRecall: {
            secondary: true,
            sentinelPreflight: goldPreflight.sentinelPreflight,
            ...sentinelRecall,
            note: "Only preflight-passing MUST_SURFACE sentinels count toward hard exact-card recall.",
          },
          topKCandidateQuality: {
            tertiary: true,
            blindedReviewPacketCount: blindedPackets.length,
            pendingIndependentReviewCount: blindedPackets.length,
            packetKey: "caseId × requirementId × candidateOracleId",
            blindedArtifact: BLINDED_PATH,
            postHocArtifact: POST_HOC_PATH,
          },
        },
        goldPreflight: {
          goldSealingBlocked: goldPreflight.goldSealingBlocked,
          goldSealingBlockReasons: goldPreflight.goldSealingBlockReasons,
          legalityPreflightModel: goldPreflight.legalityPreflightModel,
        },
        typedConstraints,
        densityConstraintAudit: densityAudit,
        blindedPacketIds: blindedPackets.map((p) => p.packetId),
      });
    }
  }

  const upstreamAudit = auditAllUpstreamNegativeSpecs(upstreamSpecInputs, catalog);
  const specCorrectionOverlay = buildSpecCorrectionOverlayEntries(
    upstreamAudit.entries.map((e) => ({
      caseId: e.caseId,
      commanders: e.commanders,
      spec: upstreamSpecInputs.find((x) => x.caseId === e.caseId)!.spec,
      rawConstraint: e.rawConstraint,
      classification: e.classification,
    })),
  );
  const outputProvenance = outputProvenanceMetaAudit(metaCandidates);

  const coverageProxies = caseCalibrations.map(
    (c) =>
      (c.evaluationDimensions as { automatedFunctionalCoverageProxy: { automatedFunctionalCoverageProxy: number } })
        .automatedFunctionalCoverageProxy.automatedFunctionalCoverageProxy,
  );
  const exactRecalls = caseCalibrations
    .map(
      (c) =>
        (c.evaluationDimensions as { exactCardSentinelRecall: { exactCardSentinelRecall: number | null } })
          .exactCardSentinelRecall.exactCardSentinelRecall,
    )
    .filter((v): v is number => v != null);

  const artifact = {
    version: "phase6a-human-calibration-v2",
    generatedAt: new Date().toISOString(),
    retrievalEngineVersion: SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
    calibrationMethodology: {
      status: "V2_FRAMEWORK",
      v1Status: "AUTOMATED_DIAGNOSTIC_ONLY",
      primaryMetric: "automatedFunctionalCoverageProxy",
      primaryMetricNote:
        "Score-independent but deterministic — uses oracle regex + ShadowSemanticIndex derived roles, not MTG expert adjudication.",
      evaluationDimensions: [
        { id: "FUNCTIONAL_SEMANTIC_RECALL", metric: "automatedFunctionalCoverageProxy", priority: "PRIMARY" },
        { id: "EXACT_CARD_SENTINEL_RECALL", priority: "SECONDARY" },
        { id: "TOP_K_CANDIDATE_QUALITY", priority: "TERTIARY_REQUIRES_INDEPENDENT_REVIEWER" },
      ],
      reviewPacketKey: "caseId × requirementId × candidateOracleId",
      blindedReviewerArtifact: BLINDED_PATH,
      postHocScoreArtifact: POST_HOC_PATH,
      goldLegalityPreflightModel: BENCHMARK_COMMANDER_LEGALITY_VERSION,
      phase5ArtifactMutation: "PROHIBITED — use RetrievalSpecificationCorrection overlay",
      retrieverTuning: "WAIT",
    },
    authorization: {
      phase6AImplementation: "CONTINUES",
      phase6ACalibrationV1: "AUTOMATED_DIAGNOSTIC_ONLY",
      phase6ACalibrationV2: "AUTHORIZED_IN_PROGRESS",
      independentHumanReview: "REQUIRED_PENDING",
      semanticRetrieverRecallChanges: "WAIT",
      phase6AFreeze: "WAIT",
    },
    artifacts: {
      calibrationSummary: OUT_PATH,
      blindedReviewerPackets: BLINDED_PATH,
      postHocScores: POST_HOC_PATH,
    },
    goldSealing: {
      blocked: globalGoldSealingBlocked,
      blockReasons: globalGoldSealingBlockReasons,
      legalityPreflightModel: BENCHMARK_COMMANDER_LEGALITY_VERSION,
    },
    retrievalSpecificationCorrectionOverlay: {
      version: RETRIEVAL_SPEC_CORRECTION_OVERLAY_VERSION,
      phase5Mutation: "NONE",
      minimizeConstraintPairsPendingReview: specCorrectionOverlay.length,
      humanReviewRequiredSpecConflicts: upstreamAudit.upstreamSpecConflicts.length,
      entries: specCorrectionOverlay,
      policy: "Do not apply overlay until independent adjudication. Do not enforce conflicts via retriever.",
    },
    upstreamNegativeSpecAudit: {
      casesWithMinimizeConstraint: upstreamAudit.casesWithMinimizeConstraint,
      humanReviewRequiredSpecConflictCount: upstreamAudit.upstreamSpecConflicts.length,
      entries: upstreamAudit.entries,
      humanReviewRequiredSpecConflicts: upstreamAudit.upstreamSpecConflicts,
      policy: "HUMAN_REVIEW_REQUIRED_SPEC_CONFLICT — pending independent adjudication of all 13 minimize pairs.",
    },
    preservedStructuralDiagnostics: {
      poolSizeMedian: median(poolSizesReady),
      poolSizeP10: percentile(poolSizesReady, 0.1),
      poolSizeP90: percentile(poolSizesReady, 0.9),
      retrievalReadyCases: poolSizesReady.length,
      phase5AbstentionCount: abstentionAudits.filter((a) => a.classification === "PHASE5_ABSTENTION").length,
      phase6RetrievalFailureCount: abstentionAudits.filter((a) => a.classification === "PHASE6_RETRIEVAL_FAILURE").length,
    },
    outputProvenanceMetaAudit: {
      ...outputProvenance,
      candidatesAudited: metaCandidates.length,
    },
    aggregateMetrics: {
      automatedFunctionalCoverageProxy: {
        reviewedCaseCount: caseCalibrations.length,
        meanAutomatedFunctionalCoverageProxy: average(coverageProxies),
        note: "Renamed from meanFunctionalSemanticRecallRate — deterministic proxy only.",
      },
      exactCardSentinelRecall: {
        casesWithMustSurfaceSentinels: exactRecalls.length,
        meanExactCardSentinelRecall: exactRecalls.length ? average(exactRecalls) : null,
      },
      topKCandidateQuality: {
        totalBlindedReviewPackets: allBlindedPackets.length,
        totalPostHocScoreRecords: allPostHocScores.length,
        labeledPacketCount: 0,
        note: "Independent MTG adjudication required — blinded artifact contains no system scores.",
      },
    },
    abstentionAudit: {
      cases: abstentionAudits,
      pass: abstentionAudits.every((a) => a.classification !== "PHASE6_RETRIEVAL_FAILURE"),
    },
    caseCalibrations,
  };

  artifact.artifactHash = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");

  const blindedArtifact = {
    version: "phase6a-human-calibration-v2-reviewer-blinded",
    generatedAt: artifact.generatedAt,
    reviewStatus: "PENDING_INDEPENDENT_MTG_ADJUDICATION",
    packetKey: "caseId × requirementId × candidateOracleId",
    prohibitedFields: [
      "compositeScore",
      "rankOverall",
      "commanderSemanticFit",
      "directionFit",
      "functionalRoleFit",
      "structuralFit",
      "automatedProxyLabel",
      "TOP/MIDDLE/TAIL",
    ],
    labelSchema: ["STRONG_FIT", "VALID_ALTERNATIVE", "WEAK_BUT_DEFENSIBLE", "IRRELEVANT", "MECHANICALLY_WRONG"],
    packetCount: allBlindedPackets.length,
    packets: allBlindedPackets,
  };
  blindedArtifact.artifactHash = createHash("sha256").update(JSON.stringify(blindedArtifact)).digest("hex");

  const postHocArtifact = {
    version: "phase6a-human-calibration-v2-post-hoc-scores",
    generatedAt: artifact.generatedAt,
    note: "Reveal only after independent labels assigned. Keyed by packetId.",
    recordCount: allPostHocScores.length,
    scoresByPacketId: Object.fromEntries(allPostHocScores.map((s) => [s.packetId, s])),
  };
  postHocArtifact.artifactHash = createHash("sha256").update(JSON.stringify(postHocArtifact)).digest("hex");

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "phase6a-human-calibration-v2.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(resolve(outDir, "phase6a-human-calibration-v2-reviewer-blinded.json"), `${JSON.stringify(blindedArtifact, null, 2)}\n`);
  writeFileSync(resolve(outDir, "phase6a-human-calibration-v2-post-hoc-scores.json"), `${JSON.stringify(postHocArtifact, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        calibrationSummary: OUT_PATH,
        blindedReviewer: BLINDED_PATH,
        postHocScores: POST_HOC_PATH,
        reviewedCases: caseCalibrations.length,
        meanAutomatedFunctionalCoverageProxy: artifact.aggregateMetrics.automatedFunctionalCoverageProxy.meanAutomatedFunctionalCoverageProxy,
        blindedPacketCount: allBlindedPackets.length,
        humanReviewRequiredSpecConflicts: upstreamAudit.upstreamSpecConflicts.length,
        goldLegalityModel: BENCHMARK_COMMANDER_LEGALITY_VERSION,
        phase6AFreeze: "WAIT",
      },
      null,
      2,
    ),
  );
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

function percentile(nums: number[], p: number): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)]!;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
