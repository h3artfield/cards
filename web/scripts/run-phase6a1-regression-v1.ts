#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 regression — re-run frozen 271 development adjudications against typed functional retrieval.
 * Generates changed-candidate blinded packets. REPORT AND WAIT — no freeze.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  retrieveSemanticCandidatesV11,
  SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
  matchTypeScore,
  type SemanticCandidateRetrievalReportV11,
} from "../src/lib/deck-synthesis";
import { retrieveSemanticCandidates } from "../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { FunctionalMatchType } from "../src/lib/deck-synthesis/functional-match-v1";
import { compositeCandidateScore } from "./lib/phase6a-human-retrieval-adjudication-v1";
import { getCalibrationCaseIds, preflightCaseGold } from "./lib/phase6a-calibration-v2-gold";
import { buildBlindedReviewArtifacts } from "./lib/phase6a-calibration-v2-review-packets";
import { PHASE6A1_UPSTREAM_SPEC_CONFLICTS } from "./lib/phase6a1-spec-correction-overlay-v1.1";
import type { IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";

loadProjectEnvLocal();

const FROZEN_PATH = resolve("data/milestones/deck-synthesis/phase6a-development-adjudication-frozen-v1.json");
const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-regression-report-v1.json");
const NEW_BLINDED_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-blinded-v1.json");
const NEW_POST_HOC_SEALED_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-post-hoc-sealed-v1.json");

const ALL_FAMILY_STRATA = [
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

type FamilyStratum = (typeof ALL_FAMILY_STRATA)[number];

type FamilyPositiveAccounting = {
  positiveTotal: number;
  retainedExact: number;
  retainedDirect: number;
  retainedIndirect: number;
  retainedAdjacent: number;
  noSupportRegression: number;
  reconciles: boolean;
};

type FalseExactCounters = {
  reviewedIrrelevantWithV1ExactClaim: number;
  demotedByV11: number;
  stillOverclaiming: number;
  demotionRate: number | null;
};

function emptyFamilyAccounting(): FamilyPositiveAccounting {
  return {
    positiveTotal: 0,
    retainedExact: 0,
    retainedDirect: 0,
    retainedIndirect: 0,
    retainedAdjacent: 0,
    noSupportRegression: 0,
    reconciles: true,
  };
}

function classifyFamilyPositive(acct: FamilyPositiveAccounting, matchType: FunctionalMatchType): void {
  acct.positiveTotal += 1;
  switch (matchType) {
    case "EXACT":
      acct.retainedExact += 1;
      break;
    case "DIRECT_SUPPORT":
      acct.retainedDirect += 1;
      break;
    case "INDIRECT_SUPPORT":
      acct.retainedIndirect += 1;
      break;
    case "ADJACENT":
      acct.retainedAdjacent += 1;
      break;
    default:
      acct.noSupportRegression += 1;
      break;
  }
  acct.reconciles =
    acct.positiveTotal ===
    acct.retainedExact + acct.retainedDirect + acct.retainedIndirect + acct.retainedAdjacent + acct.noSupportRegression;
}

function emptyFalseExactCounters(): Omit<FalseExactCounters, "demotionRate"> {
  return { reviewedIrrelevantWithV1ExactClaim: 0, demotedByV11: 0, stillOverclaiming: 0 };
}

function finalizeFalseExactCounters(counters: Omit<FalseExactCounters, "demotionRate">): FalseExactCounters {
  return {
    ...counters,
    demotionRate:
      counters.reviewedIrrelevantWithV1ExactClaim > 0
        ? counters.demotedByV11 / counters.reviewedIrrelevantWithV1ExactClaim
        : null,
  };
}

function recordFalseExact(
  counters: Omit<FalseExactCounters, "demotionRate">,
  demoted: boolean,
): void {
  counters.reviewedIrrelevantWithV1ExactClaim += 1;
  if (demoted) counters.demotedByV11 += 1;
  else counters.stillOverclaiming += 1;
}

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

const POSITIVE_LABELS = new Set<IndependentCandidateLabel>(["STRONG_FIT", "VALID_ALTERNATIVE", "WEAK_BUT_DEFENSIBLE"]);

type FrozenPacket = {
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  independentReviewLabel: IndependentCandidateLabel | null;
  independentReviewSpecStatus?: string | null;
};

const SUCCESSFUL_FAMILY_STRATA = new Set<FamilyStratum>(["mill", "graveyard_setup", "card_draw", "token_generation", "recursion"]);

function slugRequirementId(linkedSpecField: string): string {
  const [, token] = linkedSpecField.split(":");
  return (token ?? linkedSpecField).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
}

function bestMatchForGoldRequirement(
  functionalMatches: Array<{ requirementId: string; matchType: FunctionalMatchType; mechanism?: string }>,
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

function functionStratum(requirementId: string, linkedFields: string[]): string {
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

function rankForGoldRequirement(
  report: SemanticCandidateRetrievalReportV11,
  linkedSpecFields: string[],
): SemanticCandidateRetrievalReportV11["candidates"] {
  return [...report.candidates].sort((a, b) => {
    const scoreA = matchTypeScore(bestMatchForGoldRequirement(a.functionalMatches, linkedSpecFields).matchType);
    const scoreB = matchTypeScore(bestMatchForGoldRequirement(b.functionalMatches, linkedSpecFields).matchType);
    return scoreB - scoreA || b.generalCandidateScore - a.generalCandidateScore || a.oracleId.localeCompare(b.oracleId);
  });
}

function precisionAtK(
  report: SemanticCandidateRetrievalReportV11,
  linkedSpecFields: string[],
  labelByOracle: Map<string, IndependentCandidateLabel>,
  k: number,
): number | null {
  const ranked = rankForGoldRequirement(report, linkedSpecFields).slice(0, k);
  const labeled = ranked.filter((c) => labelByOracle.has(c.oracleId));
  if (!labeled.length) return null;
  return labeled.filter((c) => POSITIVE_LABELS.has(labelByOracle.get(c.oracleId)!)).length / labeled.length;
}

function scoreSaturation(scores: number[]): { uniqueCount: number; total: number; saturated675Or700: number; saturationRate: number } {
  const rounded = scores.map((s) => Math.round(s * 1000) / 1000);
  const saturated675Or700 = rounded.filter((s) => s === 0.675 || s === 0.7).length;
  return {
    uniqueCount: new Set(rounded).size,
    total: scores.length,
    saturated675Or700,
    saturationRate: saturated675Or700 / Math.max(scores.length, 1),
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  let frozenPackets: FrozenPacket[] = [];
  let frozenLabelsLoaded = false;
  if (existsSync(FROZEN_PATH)) {
    const frozen = JSON.parse(readFileSync(FROZEN_PATH, "utf8")) as { packets: FrozenPacket[] };
    frozenPackets = frozen.packets.filter((p) => p.independentReviewLabel != null);
    frozenLabelsLoaded = frozenPackets.length > 0;
  }

  const caseResults: Array<Record<string, unknown>> = [];
  const newBlindedPackets: Array<Record<string, unknown>> = [];
  const sealedChangedPostHocScores: Array<Record<string, unknown>> = [];
  const allV1Scores: number[] = [];
  const allV11Scores: number[] = [];
  const falseExactDemotions: Array<Record<string, unknown>> = [];
  const falseExactStillClaimed: Array<Record<string, unknown>> = [];
  const retainedPositive: Array<Record<string, unknown>> = [];
  const regressedPositive: Array<Record<string, unknown>> = [];
  const promotedPositive: Array<Record<string, unknown>> = [];
  const strataMetrics: Record<string, { packets: number; falseExactV1: number; demoted: number; retainedPositive: number }> = {};
  const familyPositiveAccounting: Record<FamilyStratum, FamilyPositiveAccounting> = Object.fromEntries(
    ALL_FAMILY_STRATA.map((s) => [s, emptyFamilyAccounting()]),
  ) as Record<FamilyStratum, FamilyPositiveAccounting>;
  const falseExactAll = emptyFalseExactCounters();
  const falseExactSpecValid = emptyFalseExactCounters();
  const falseExactUpstream = emptyFalseExactCounters();
  const matchTypePrecision: Record<string, { labeled: number; positive: number }> = {
    EXACT: { labeled: 0, positive: 0 },
    DIRECT_SUPPORT: { labeled: 0, positive: 0 },
  };

  for (const spec of EVAL_SETS) {
    for (const c of spec.cases) {
      if (!reviewCaseIds.has(c.id)) continue;
      const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
      if (!resolution.resolved) continue;

      const discovery = discoverArchetypes(
        { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
        { catalog, shadowIndex, globalCatalogIndex: globalIndex },
      );
      const primary = discovery.buildDirections.find((d) => d.rank === 1);
      if (!primary?.phase6RetrievalReady) continue;

      const profile = buildCommanderMechanicalProfile({
        commanderOracleIds: resolution.oracleIds,
        catalogByOracleId: catalog.byOracleId,
        shadowIndex,
      })!;
      const motifs = extractMechanicalMotifs(profile);
      const anchors = extractDirectionAnchors({ profile, motifs });
      const colorIdentity =
        discovery.commandZoneComposition?.combinedColorIdentity ??
        resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []);
      const combinedColorIdentity = [...new Set(colorIdentity)];
      const roleIndex = filterCatalogRoleIndex(globalIndex, combinedColorIdentity);

      const request = {
        commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
        bracket: c.bracket,
        commanderOracleIds: resolution.oracleIds,
        combinedColorIdentity,
        buildDirections: discovery.buildDirections,
        directionAnchors: anchors,
        retrievalSpecifications: [primary.retrievalSpecification],
        commandZoneComposition: discovery.commandZoneComposition,
        namedArchetype: null,
      };
      const ctx = { catalog, shadowIndex, roleIndex, semanticNeighbors, gameChangerSnapshot };

      const v1 = retrieveSemanticCandidates(request, ctx);
      const v11 = retrieveSemanticCandidatesV11(request, ctx);

      for (const cand of v1.candidates) allV1Scores.push(compositeCandidateScore(cand));
      for (const cand of v11.candidates) allV11Scores.push(cand.generalCandidateScore);

      const goldPreflight = preflightCaseGold({
        caseId: c.id,
        spec: primary.retrievalSpecification,
        catalog,
        combinedColorIdentity,
        bracket: c.bracket,
        gameChangerSnapshot,
      });

      const casePacketLabels = frozenPackets.filter((p) => p.caseId === c.id);
      const labelByOracle = new Map<string, IndependentCandidateLabel>();
      for (const p of casePacketLabels) labelByOracle.set(p.candidateOracleId, p.independentReviewLabel!);

      const requirementMetrics: Array<Record<string, unknown>> = [];

      for (const req of goldPreflight.functionalSemanticRequirements) {
        const stratum = functionStratum(req.requirementId, req.linkedSpecFields);
        if (!strataMetrics[stratum]) strataMetrics[stratum] = { packets: 0, falseExactV1: 0, demoted: 0, retainedPositive: 0 };

        const v1Top5 = [...v1.candidates]
          .sort((a, b) => compositeCandidateScore(b) - compositeCandidateScore(a))
          .slice(0, 5)
          .map((x) => x.oracleId);
        const v11Top5 = rankForGoldRequirement(v11, req.linkedSpecFields).slice(0, 5).map((x) => x.oracleId);

        const changedTop = v11Top5.filter((id) => !v1Top5.includes(id));
        const reviewedCandidates = new Set(casePacketLabels.filter((p) => p.requirementId === req.requirementId).map((p) => p.candidateOracleId));
        const newTop = v11Top5.filter((id) => !reviewedCandidates.has(id));

        if (changedTop.length || newTop.length) {
          const sampleIds = [...new Set([...changedTop, ...newTop])];
          const { blindedPackets, postHocScores } = buildBlindedReviewArtifacts({
            caseId: c.id,
            commanders: c.commanders,
            commanderOracleIds: resolution.oracleIds,
            commandZoneConfiguration: request.commandZoneConfiguration,
            combinedColorIdentity,
            bracket: c.bracket,
            primary,
            requirements: [req],
            candidates: v11.candidates.filter((cand) => sampleIds.includes(cand.oracleId)),
            catalog,
            shadowIndex,
          });
          for (const bp of blindedPackets) {
            newBlindedPackets.push({
              ...bp,
              changeReason: changedTop.includes(bp.candidateOracleId) ? "CHANGED_TOP_CANDIDATE" : "NEW_TOP_CANDIDATE",
            });
          }
          for (const score of postHocScores) {
            sealedChangedPostHocScores.push(score);
          }
        }

        requirementMetrics.push({
          requirementId: req.requirementId,
          stratum,
          top5Precision: frozenLabelsLoaded ? precisionAtK(v11, req.linkedSpecFields, labelByOracle, 5) : null,
          top10Precision: frozenLabelsLoaded ? precisionAtK(v11, req.linkedSpecFields, labelByOracle, 10) : null,
          top20Precision: frozenLabelsLoaded ? precisionAtK(v11, req.linkedSpecFields, labelByOracle, 20) : null,
          changedTop5Count: changedTop.length,
          newTop5Count: newTop.length,
        });

        for (const p of casePacketLabels.filter((x) => x.requirementId === req.requirementId)) {
          strataMetrics[stratum]!.packets += 1;
          const v1Cand = v1.candidates.find((x) => x.oracleId === p.candidateOracleId);
          const v11Cand = v11.candidates.find((x) => x.oracleId === p.candidateOracleId);
          if (!v1Cand || !v11Cand) continue;

          const label = p.independentReviewLabel!;
          const reqMatch = bestMatchForGoldRequirement(v11Cand.functionalMatches, req.linkedSpecFields);
          const matchType = reqMatch.matchType;

          if (matchType === "EXACT" || matchType === "DIRECT_SUPPORT") {
            const bucket = matchTypePrecision[matchType]!;
            bucket.labeled += 1;
            if (POSITIVE_LABELS.has(label)) bucket.positive += 1;
          }

          const wasFalseExact = v1Cand.functionalRoleFit >= 0.99 && label === "IRRELEVANT";
          if (wasFalseExact) strataMetrics[stratum]!.falseExactV1 += 1;

          const v11ReqFit = matchTypeScore(matchType);
          const demoted = wasFalseExact && v11ReqFit < 0.5;
          if (wasFalseExact) {
            recordFalseExact(falseExactAll, demoted);
            if (p.independentReviewSpecStatus === "SPEC_VALID") recordFalseExact(falseExactSpecValid, demoted);
            if (p.independentReviewSpecStatus === "UPSTREAM_SPEC_CONFLICT") recordFalseExact(falseExactUpstream, demoted);
          }
          if (demoted) {
            strataMetrics[stratum]!.demoted += 1;
            falseExactDemotions.push({
              packetId: p.packetId,
              caseId: c.id,
              requirementId: req.requirementId,
              stratum,
              candidateOracleId: p.candidateOracleId,
              v1FunctionalRoleFit: v1Cand.functionalRoleFit,
              v11RequirementFit: v11ReqFit,
              v11MatchType: matchType,
              independentReviewLabel: label,
            });
          } else if (wasFalseExact && v11ReqFit >= 0.5) {
            falseExactStillClaimed.push({
              packetId: p.packetId,
              caseId: c.id,
              requirementId: req.requirementId,
              stratum,
              candidateOracleId: p.candidateOracleId,
              v1FunctionalRoleFit: v1Cand.functionalRoleFit,
              v11RequirementFit: v11ReqFit,
              v11MatchType: matchType,
            });
          }

          const isPositiveLabel = label === "STRONG_FIT" || label === "VALID_ALTERNATIVE";
          const v11Rank =
            rankForGoldRequirement(v11, req.linkedSpecFields).findIndex((x) => x.oracleId === p.candidateOracleId) + 1;
          const v1Rank = [...v1.candidates]
            .sort((a, b) => compositeCandidateScore(b) - compositeCandidateScore(a))
            .findIndex((x) => x.oracleId === p.candidateOracleId) + 1;
          const v11HasSupport = v11ReqFit >= 0.58;

          if (isPositiveLabel) {
            const familyKey = (ALL_FAMILY_STRATA.includes(stratum as FamilyStratum) ? stratum : "other") as FamilyStratum;
            classifyFamilyPositive(familyPositiveAccounting[familyKey], matchType);
          }

          if (isPositiveLabel && v11HasSupport) {
            strataMetrics[stratum]!.retainedPositive += 1;
            retainedPositive.push({
              packetId: p.packetId,
              caseId: c.id,
              requirementId: req.requirementId,
              label,
              matchType,
              v1Rank,
              v11Rank,
            });
            if (v11Rank < v1Rank) {
              promotedPositive.push({ packetId: p.packetId, caseId: c.id, requirementId: req.requirementId, v1Rank, v11Rank, label });
            }
          } else if (isPositiveLabel && !v11HasSupport) {
            regressedPositive.push({
              packetId: p.packetId,
              caseId: c.id,
              requirementId: req.requirementId,
              stratum,
              label,
              matchType,
              v11RequirementFit: v11ReqFit,
            });
          }

          if (POSITIVE_LABELS.has(label) && matchTypeScore(matchType as FunctionalMatchType) >= 0.58) {
            // counted above for STRONG/VALID; WEAK_BUT_DEFENSIBLE retained separately
          } else if (label === "WEAK_BUT_DEFENSIBLE" && v11HasSupport) {
            retainedPositive.push({ packetId: p.packetId, caseId: c.id, requirementId: req.requirementId, label, matchType });
          }
        }
      }

      caseResults.push({
        caseId: c.id,
        poolSizeV1: v1.poolStats.candidateCount,
        poolSizeV11: v11.poolStats.candidateCount,
        poolPreserved: v11.poolStats.candidateCount >= v1.poolStats.candidateCount,
        falseExactClaimCount: v11.candidates.filter((x) => x.falseExactFunctionClaim).length,
        requirementMetrics,
      });
    }
  }

  const v1Sat = scoreSaturation(allV1Scores);
  const v11Sat = scoreSaturation(allV11Scores);

  const p13FalseExact = {
    ALL_FROZEN_PACKETS: finalizeFalseExactCounters(falseExactAll),
    SPEC_VALID_ONLY: finalizeFalseExactCounters(falseExactSpecValid),
    UPSTREAM_SPEC_CONFLICT: finalizeFalseExactCounters(falseExactUpstream),
  };

  const strongValidLabels = frozenPackets.filter(
    (p) => p.independentReviewLabel === "STRONG_FIT" || p.independentReviewLabel === "VALID_ALTERNATIVE",
  );
  const p13PositiveRetention = {
    strongOrValidLabeled: strongValidLabels.length,
    retainedOrSupported: strongValidLabels.length - regressedPositive.length,
    promotedRank: promotedPositive.length,
    regressed: regressedPositive.length,
    retentionRate: strongValidLabels.length
      ? (strongValidLabels.length - regressedPositive.length) / strongValidLabels.length
      : null,
    regressionRate: strongValidLabels.length ? regressedPositive.length / strongValidLabels.length : null,
  };

  const allFamiliesReconcile = ALL_FAMILY_STRATA.every((s) => familyPositiveAccounting[s].reconciles);

  const report = {
    version: "phase6a1-regression-report-v1",
    retrievalVersion: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
    generatedAt: new Date().toISOString(),
    authorization: {
      phase6A1Implementation: "IMPLEMENTED / UNDER REVIEW",
      furtherFunctionalSemanticTuning: "WAIT",
      changedNewCandidateAdjudication: "REQUIRED",
      specCorrectionOverlayAdjudication: "REQUIRED",
      phase6AFreeze: "WAIT",
      acceptanceThresholds: "NOT_FROZEN",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    frozenDevelopmentAdjudication: {
      path: FROZEN_PATH,
      loaded: frozenLabelsLoaded,
      labeledPacketCount: frozenPackets.length,
      expectedPacketCount: 271,
      source: "phase6a-human-calibration-v2-independent-review-gpt56sol.json",
      note: "Authoritative development adjudication — labels not used for retriever tuning.",
    },
    phase6A1RegressionP13: {
      falseExactFunctionMatchRepair: p13FalseExact,
      strongValidRetention: p13PositiveRetention,
      perFamilyPositiveLabelAccounting: {
        labelScope: "STRONG_FIT + VALID_ALTERNATIVE only",
        allFamiliesReconcile,
        byFamily: familyPositiveAccounting,
      },
      falseExactDemotionExamples: falseExactDemotions.slice(0, 25),
      falseExactStillClaimedExamples: falseExactStillClaimed.slice(0, 15),
      regressedPositiveExamples: regressedPositive.slice(0, 25),
    },
    scoreDiscrimination: {
      v1: v1Sat,
      v11: v11Sat,
      improvementUniqueScores: v11Sat.uniqueCount - v1Sat.uniqueCount,
    },
    falseExactFunctionMatchRepair: {
      demotionCount: falseExactDemotions.length,
      stillOverclaimingCount: falseExactStillClaimed.length,
      examples: falseExactDemotions.slice(0, 25),
    },
    retainedPositiveExamples: {
      count: retainedPositive.length,
      promotedCount: promotedPositive.length,
      regressedCount: regressedPositive.length,
      sample: retainedPositive.slice(0, 25),
      regressedSample: regressedPositive.slice(0, 25),
    },
    perFunctionStrata: strataMetrics,
    matchTypePrecision: {
      EXACT: matchTypePrecision.EXACT!.labeled
        ? matchTypePrecision.EXACT!.positive / matchTypePrecision.EXACT!.labeled
        : null,
      DIRECT_SUPPORT: matchTypePrecision.DIRECT_SUPPORT!.labeled
        ? matchTypePrecision.DIRECT_SUPPORT!.positive / matchTypePrecision.DIRECT_SUPPORT!.labeled
        : null,
    },
    upstreamSpecCorrectionOverlay: {
      overlayStatus: "PENDING_INDEPENDENT_REVIEW",
      applyToPhase5: false,
      pendingCount: PHASE6A1_UPSTREAM_SPEC_CONFLICTS.filter((e) => e.overlayStatus === "PENDING_INDEPENDENT_REVIEW").length,
      entries: PHASE6A1_UPSTREAM_SPEC_CONFLICTS.map((e) => ({
        caseId: e.caseId,
        conflictRequirementId: e.conflictRequirementId,
        overlayStatus: e.overlayStatus,
      })),
    },
    changedCandidateBlindedReview: {
      blindedArtifact: NEW_BLINDED_PATH,
      newPacketCount: newBlindedPackets.length,
      postHocScoresArtifact: NEW_POST_HOC_SEALED_PATH,
      postHocScoresStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
      postHocRecordCount: sealedChangedPostHocScores.length,
      note: "New/changed top candidates require fresh independent blinded review — do not auto-label from frozen 271. Post-hoc scores sealed separately.",
    },
    caseResults,
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  writeFileSync(
    NEW_BLINDED_PATH,
    JSON.stringify(
      {
        version: "phase6a1-changed-candidate-blinded-v1",
        reviewStatus: "PENDING_INDEPENDENT_REVIEW",
        postHocScoresArtifact: "phase6a1-changed-candidate-post-hoc-sealed-v1.json",
        postHocScoresStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
        packetCount: newBlindedPackets.length,
        note: "Do not inherit labels from frozen 271-packet development adjudication.",
        packets: newBlindedPackets,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    NEW_POST_HOC_SEALED_PATH,
    JSON.stringify(
      {
        version: "phase6a1-changed-candidate-post-hoc-sealed-v1",
        reviewStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
        recordCount: sealedChangedPostHocScores.length,
        note: "Reveal only after independent labels assigned for changed/new candidate packets.",
        scoresByPacketId: Object.fromEntries(sealedChangedPostHocScores.map((s) => [(s as { packetId: string }).packetId, s])),
      },
      null,
      2,
    ),
  );

  console.log(`Phase 6A.1 regression report: ${OUT_PATH}`);
  console.log(`Changed-candidate blinded packets: ${NEW_BLINDED_PATH} (${newBlindedPackets.length} packets)`);
  console.log(`Sealed post-hoc (changed candidates): ${NEW_POST_HOC_SEALED_PATH} (${sealedChangedPostHocScores.length} records)`);
  console.log(`Frozen labels loaded: ${frozenLabelsLoaded} (${frozenPackets.length}/271)`);
  console.log(`Score saturation v1→v1.1: ${(v1Sat.saturationRate * 100).toFixed(1)}% → ${(v11Sat.saturationRate * 100).toFixed(1)}%`);
  console.log(`Unique composite scores v1→v1.1: ${v1Sat.uniqueCount} → ${v11Sat.uniqueCount}`);
  console.log(
    `False-exact demotions ALL: ${p13FalseExact.ALL_FROZEN_PACKETS.demotedByV11}/${p13FalseExact.ALL_FROZEN_PACKETS.reviewedIrrelevantWithV1ExactClaim} | SPEC_VALID: ${p13FalseExact.SPEC_VALID_ONLY.demotedByV11}/${p13FalseExact.SPEC_VALID_ONLY.reviewedIrrelevantWithV1ExactClaim} | UPSTREAM: ${p13FalseExact.UPSTREAM_SPEC_CONFLICT.demotedByV11}/${p13FalseExact.UPSTREAM_SPEC_CONFLICT.reviewedIrrelevantWithV1ExactClaim}`,
  );
  console.log(`STRONG/VALID retention: ${p13PositiveRetention.retainedOrSupported}/${p13PositiveRetention.strongOrValidLabeled} (regressed: ${regressedPositive.length})`);
  console.log(`Per-family accounting reconciles: ${allFamiliesReconcile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
