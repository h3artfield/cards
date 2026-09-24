#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Clean P14 baseline on frozen 271 development adjudication.
 * Applies overlay v1.3.1 for 8 P11 cases. No retriever semantic tuning.
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
} from "../src/lib/deck-synthesis";
import type { FunctionalMatchType } from "../src/lib/deck-synthesis/functional-match-v1";
import { retrieveSemanticCandidates } from "../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import { compositeCandidateScore } from "./lib/phase6a-human-retrieval-adjudication-v1";
import { getCalibrationCaseIds, preflightCaseGold } from "./lib/phase6a-calibration-v2-gold";
import type { IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";
import {
  P14_FUNCTION_STRATA,
  POSITIVE_HUMAN_LABELS,
  STRONG_VALID_LABELS,
  bestMatchForGoldRequirement,
  functionStratum,
  labelKey,
  rankForGoldRequirement,
  topKHumanPrecision,
  type P14FunctionStratum,
} from "./lib/phase6a1-p14-metrics-v1";
import {
  getEffectiveSpecForCase,
  P11_OVERLAY_CASE_IDS,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
} from "./lib/phase6a1-spec-correction-overlay-v1.3.1";

loadProjectEnvLocal();

const FROZEN_271_PATH = resolve("data/milestones/deck-synthesis/phase6a-development-adjudication-frozen-v1.json");
const AUDIT_V2_PATH = resolve("data/milestones/deck-synthesis/phase6a1-p11-residual-spec-audit-v2.json");
const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-clean-p14-baseline-v1.json");

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

type EvalStratum = "SPEC_VALID" | "CONFIRMED_CORRECTED_SPEC" | "UPSTREAM_INVALID_EXCLUDED";

type FrozenPacket = {
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  independentReviewLabel: IndependentCandidateLabel | null;
  independentReviewSpecStatus?: string | null;
  reviewContext?: { requirement?: { linkedSpecFields?: string[] } };
};

function weightedMean(values: Array<{ weight: number; value: number }>): number | null {
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (!totalWeight) return null;
  return values.reduce((s, v) => s + v.weight * v.value, 0) / totalWeight;
}

function packetEvalStratum(p: FrozenPacket): EvalStratum {
  if (p.independentReviewSpecStatus === "UPSTREAM_SPEC_CONFLICT") return "UPSTREAM_INVALID_EXCLUDED";
  if (P11_OVERLAY_CASE_IDS.includes(p.caseId)) return "CONFIRMED_CORRECTED_SPEC";
  return "SPEC_VALID";
}

function emptyTopKAggregate() {
  return {
    top5: [] as Array<{ weight: number; value: number }>,
    top10: [] as Array<{ weight: number; value: number }>,
    top20: [] as Array<{ weight: number; value: number }>,
  };
}

function emptyFunctionCoverage(): Record<
  P14FunctionStratum,
  { packetCount: number; strongValid: number; viable: number; irrelevant: number }
> {
  return Object.fromEntries(
    P14_FUNCTION_STRATA.map((s) => [s, { packetCount: 0, strongValid: 0, viable: 0, irrelevant: 0 }]),
  ) as Record<P14FunctionStratum, { packetCount: number; strongValid: number; viable: number; irrelevant: number }>;
}

async function main() {
  if (!existsSync(FROZEN_271_PATH)) throw new Error(`Missing frozen 271: ${FROZEN_271_PATH}`);
  if (!existsSync(AUDIT_V2_PATH)) throw new Error(`Run residual audit v2 first: ${AUDIT_V2_PATH}`);

  const auditV2 = JSON.parse(readFileSync(AUDIT_V2_PATH, "utf8")) as {
    summary: { classificationCounts: { RESIDUAL_CONTAMINATION: number } };
  };
  if (auditV2.summary.classificationCounts.RESIDUAL_CONTAMINATION > 0) {
    throw new Error("Clean P14 blocked: residual contamination remains in audit v2");
  }

  const frozen = JSON.parse(readFileSync(FROZEN_271_PATH, "utf8")) as { packets: FrozenPacket[] };
  const frozenPackets = frozen.packets.filter((p) => p.independentReviewLabel != null);

  const labelByKey = new Map<string, IndependentCandidateLabel>();
  const linkedFieldsByPacket = new Map<string, string[]>();
  const stratumByPacket = new Map<string, EvalStratum>();
  for (const p of frozenPackets) {
    labelByKey.set(labelKey(p.caseId, p.requirementId, p.candidateOracleId), p.independentReviewLabel!);
    linkedFieldsByPacket.set(p.packetId, p.reviewContext?.requirement?.linkedSpecFields ?? []);
    stratumByPacket.set(p.packetId, packetEvalStratum(p));
  }

  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const strataTopK: Record<EvalStratum, ReturnType<typeof emptyTopKAggregate>> = {
    SPEC_VALID: emptyTopKAggregate(),
    CONFIRMED_CORRECTED_SPEC: emptyTopKAggregate(),
    UPSTREAM_INVALID_EXCLUDED: emptyTopKAggregate(),
  };
  const cleanTopK = emptyTopKAggregate();

  const perFunctionCoverage = emptyFunctionCoverage();
  const perFunctionCoverageClean = emptyFunctionCoverage();

  const matchTypeCounts: Record<
    EvalStratum | "CLEAN_EXCLUDING_UPSTREAM",
    Record<string, { labeled: number; positive: number }>
  > = {
    SPEC_VALID: {
      EXACT: { labeled: 0, positive: 0 },
      DIRECT_SUPPORT: { labeled: 0, positive: 0 },
      INDIRECT_SUPPORT: { labeled: 0, positive: 0 },
    },
    CONFIRMED_CORRECTED_SPEC: {
      EXACT: { labeled: 0, positive: 0 },
      DIRECT_SUPPORT: { labeled: 0, positive: 0 },
      INDIRECT_SUPPORT: { labeled: 0, positive: 0 },
    },
    UPSTREAM_INVALID_EXCLUDED: {
      EXACT: { labeled: 0, positive: 0 },
      DIRECT_SUPPORT: { labeled: 0, positive: 0 },
      INDIRECT_SUPPORT: { labeled: 0, positive: 0 },
    },
    CLEAN_EXCLUDING_UPSTREAM: {
      EXACT: { labeled: 0, positive: 0 },
      DIRECT_SUPPORT: { labeled: 0, positive: 0 },
      INDIRECT_SUPPORT: { labeled: 0, positive: 0 },
    },
  };

  let falseExactTotal = 0;
  let falseExactStill = 0;
  let falseExactTotalClean = 0;
  let falseExactStillClean = 0;

  const failureFamilies: Record<
    P14FunctionStratum,
    { positiveLabels: number; noSupport: number; adjacentOnly: number; exactRetained: number; directRetained: number; indirectRetained: number }
  > = Object.fromEntries(
    P14_FUNCTION_STRATA.map((s) => [
      s,
      { positiveLabels: 0, noSupport: 0, adjacentOnly: 0, exactRetained: 0, directRetained: 0, indirectRetained: 0 },
    ]),
  ) as Record<
    P14FunctionStratum,
    { positiveLabels: number; noSupport: number; adjacentOnly: number; exactRetained: number; directRetained: number; indirectRetained: number }
  >;

  const requirementRows: Array<Record<string, unknown>> = [];
  const stratumPacketCounts: Record<EvalStratum, number> = {
    SPEC_VALID: 0,
    CONFIRMED_CORRECTED_SPEC: 0,
    UPSTREAM_INVALID_EXCLUDED: 0,
  };

  for (const p of frozenPackets) {
    stratumPacketCounts[packetEvalStratum(p)] += 1;
  }

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

      const effective = getEffectiveSpecForCase(c.id, primary.retrievalSpecification, primary.mechanicalDescription);

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

      const v11 = retrieveSemanticCandidatesV11(
        {
          commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
          bracket: c.bracket,
          commanderOracleIds: resolution.oracleIds,
          combinedColorIdentity,
          buildDirections: discovery.buildDirections,
          directionAnchors: anchors,
          retrievalSpecifications: [effective.spec],
          commandZoneComposition: discovery.commandZoneComposition,
          namedArchetype: null,
        },
        { catalog, shadowIndex, roleIndex, semanticNeighbors, gameChangerSnapshot },
      );

      const v1 = retrieveSemanticCandidates(
        {
          commandZoneConfiguration: "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander",
          bracket: c.bracket,
          commanderOracleIds: resolution.oracleIds,
          combinedColorIdentity,
          buildDirections: discovery.buildDirections,
          directionAnchors: anchors,
          retrievalSpecifications: [effective.spec],
          commandZoneComposition: discovery.commandZoneComposition,
          namedArchetype: null,
        },
        { catalog, shadowIndex, roleIndex, semanticNeighbors, gameChangerSnapshot },
      );

      const goldPreflight = preflightCaseGold({
        caseId: c.id,
        spec: effective.spec,
        catalog,
        combinedColorIdentity,
        bracket: c.bracket,
        gameChangerSnapshot,
      });

      const validRequirementIds = new Set(goldPreflight.functionalSemanticRequirements.map((r) => r.requirementId));

      for (const req of goldPreflight.functionalSemanticRequirements) {
        const fnStratum = functionStratum(req.requirementId, req.linkedSpecFields);
        const ranked = rankForGoldRequirement(v11, req.linkedSpecFields);
        const rankedOracleIds = ranked.map((x) => x.oracleId);

        const top5 = topKHumanPrecision(rankedOracleIds, 5, labelByKey, c.id, req.requirementId);
        const top10 = topKHumanPrecision(rankedOracleIds, 10, labelByKey, c.id, req.requirementId);
        const top20 = topKHumanPrecision(rankedOracleIds, 20, labelByKey, c.id, req.requirementId);

        const caseStratum: EvalStratum = P11_OVERLAY_CASE_IDS.includes(c.id)
          ? "CONFIRMED_CORRECTED_SPEC"
          : "SPEC_VALID";

        for (const [bucket, result] of [
          ["top5", top5],
          ["top10", top10],
          ["top20", top20],
        ] as const) {
          if (result.precisionStrongValid != null) {
            strataTopK[caseStratum][bucket].push({ weight: result.labeledCountInTopK, value: result.precisionStrongValid });
            cleanTopK[bucket].push({ weight: result.labeledCountInTopK, value: result.precisionStrongValid });
          }
        }

        requirementRows.push({
          caseId: c.id,
          requirementId: req.requirementId,
          evalStratum: caseStratum,
          functionStratum: fnStratum,
          overlayApplied: P11_OVERLAY_CASE_IDS.includes(c.id),
          poolSize: ranked.length,
          top5,
          top10,
          top20,
        });

        const casePackets = frozenPackets.filter((p) => p.caseId === c.id && p.requirementId === req.requirementId);

        for (const p of casePackets) {
          const pStratum = stratumByPacket.get(p.packetId)!;
          const linkedFields = linkedFieldsByPacket.get(p.packetId) ?? req.linkedSpecFields;
          const fn = functionStratum(p.requirementId, linkedFields);

          if (pStratum !== "UPSTREAM_INVALID_EXCLUDED") {
            perFunctionCoverageClean[fn].packetCount += 1;
            if (STRONG_VALID_LABELS.has(p.independentReviewLabel!)) perFunctionCoverageClean[fn].strongValid += 1;
            if (POSITIVE_HUMAN_LABELS.has(p.independentReviewLabel!)) perFunctionCoverageClean[fn].viable += 1;
            if (p.independentReviewLabel === "IRRELEVANT") perFunctionCoverageClean[fn].irrelevant += 1;
          }

          perFunctionCoverage[fn].packetCount += 1;
          if (STRONG_VALID_LABELS.has(p.independentReviewLabel!)) perFunctionCoverage[fn].strongValid += 1;
          if (POSITIVE_HUMAN_LABELS.has(p.independentReviewLabel!)) perFunctionCoverage[fn].viable += 1;
          if (p.independentReviewLabel === "IRRELEVANT") perFunctionCoverage[fn].irrelevant += 1;

          const v11Cand = v11.candidates.find((x) => x.oracleId === p.candidateOracleId);
          const v1Cand = v1.candidates.find((x) => x.oracleId === p.candidateOracleId);
          if (!v11Cand || !v1Cand) continue;

          const match = bestMatchForGoldRequirement(v11Cand.functionalMatches, linkedFields);
          const matchType = match.matchType;

          const buckets = [pStratum];
          if (pStratum !== "UPSTREAM_INVALID_EXCLUDED") buckets.push("CLEAN_EXCLUDING_UPSTREAM");

          for (const bucket of buckets) {
            if (matchType === "EXACT" || matchType === "DIRECT_SUPPORT" || matchType === "INDIRECT_SUPPORT") {
              matchTypeCounts[bucket][matchType]!.labeled += 1;
              if (POSITIVE_HUMAN_LABELS.has(p.independentReviewLabel!)) {
                matchTypeCounts[bucket][matchType]!.positive += 1;
              }
            }
          }

          const wasFalseExact = v1Cand.functionalRoleFit >= 0.99 && p.independentReviewLabel === "IRRELEVANT";
          const stillOver = wasFalseExact && matchTypeScore(matchType) >= 0.5;
          if (wasFalseExact) {
            falseExactTotal += 1;
            if (stillOver) falseExactStill += 1;
            if (pStratum !== "UPSTREAM_INVALID_EXCLUDED") {
              falseExactTotalClean += 1;
              if (stillOver) falseExactStillClean += 1;
            }
          }

          if (pStratum !== "UPSTREAM_INVALID_EXCLUDED" && POSITIVE_HUMAN_LABELS.has(p.independentReviewLabel!)) {
            const fam = failureFamilies[fn];
            fam.positiveLabels += 1;
            if (matchType === "EXACT") fam.exactRetained += 1;
            else if (matchType === "DIRECT_SUPPORT") fam.directRetained += 1;
            else if (matchType === "INDIRECT_SUPPORT") fam.indirectRetained += 1;
            else if (matchType === "ADJACENT") fam.adjacentOnly += 1;
            else fam.noSupport += 1;
          }
        }

        for (const p of frozenPackets.filter((x) => x.caseId === c.id && !validRequirementIds.has(x.requirementId))) {
          if (packetEvalStratum(p) === "UPSTREAM_INVALID_EXCLUDED") continue;
        }
      }
    }
  }

  const precision = (bucket: { labeled: number; positive: number }) =>
    bucket.labeled ? bucket.positive / bucket.labeled : null;

  const report = {
    version: "phase6a1-clean-p14-baseline-v1",
    retrievalVersion: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
    overlayVersion: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
    residualAuditV2: AUDIT_V2_PATH,
    generatedAt: new Date().toISOString(),
    authorization: {
      overlayV131: "APPLIED",
      residualAuditV2: "PASSED",
      cleanP14Baseline: "COMPLETE",
      retrieverSemanticTuning: "WAIT",
      genericDeckSupportHints: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    frozenAdjudication: {
      path: FROZEN_271_PATH,
      labeledPacketCount: frozenPackets.length,
    },
    evalStrata: {
      packetCounts: stratumPacketCounts,
      note: "UPSTREAM_INVALID_EXCLUDED removed from clean denominator. CONFIRMED_CORRECTED_SPEC uses overlay v1.3.1 effective spec.",
    },
    p14Metrics: {
      byStratum: {
        SPEC_VALID: {
          packetCount: stratumPacketCounts.SPEC_VALID,
          weightedTopKStrongValid: {
            top5: weightedMean(strataTopK.SPEC_VALID.top5),
            top10: weightedMean(strataTopK.SPEC_VALID.top10),
            top20: weightedMean(strataTopK.SPEC_VALID.top20),
          },
          matchTypePrecision: {
            EXACT: precision(matchTypeCounts.SPEC_VALID.EXACT),
            DIRECT_SUPPORT: precision(matchTypeCounts.SPEC_VALID.DIRECT_SUPPORT),
            INDIRECT_SUPPORT: precision(matchTypeCounts.SPEC_VALID.INDIRECT_SUPPORT),
          },
          matchTypeCounts: matchTypeCounts.SPEC_VALID,
        },
        CONFIRMED_CORRECTED_SPEC: {
          packetCount: stratumPacketCounts.CONFIRMED_CORRECTED_SPEC,
          overlayCaseIds: P11_OVERLAY_CASE_IDS,
          weightedTopKStrongValid: {
            top5: weightedMean(strataTopK.CONFIRMED_CORRECTED_SPEC.top5),
            top10: weightedMean(strataTopK.CONFIRMED_CORRECTED_SPEC.top10),
            top20: weightedMean(strataTopK.CONFIRMED_CORRECTED_SPEC.top20),
          },
          matchTypePrecision: {
            EXACT: precision(matchTypeCounts.CONFIRMED_CORRECTED_SPEC.EXACT),
            DIRECT_SUPPORT: precision(matchTypeCounts.CONFIRMED_CORRECTED_SPEC.DIRECT_SUPPORT),
            INDIRECT_SUPPORT: precision(matchTypeCounts.CONFIRMED_CORRECTED_SPEC.INDIRECT_SUPPORT),
          },
          matchTypeCounts: matchTypeCounts.CONFIRMED_CORRECTED_SPEC,
        },
        UPSTREAM_INVALID_EXCLUDED: {
          packetCount: stratumPacketCounts.UPSTREAM_INVALID_EXCLUDED,
          matchTypePrecision: {
            EXACT: precision(matchTypeCounts.UPSTREAM_INVALID_EXCLUDED.EXACT),
            DIRECT_SUPPORT: precision(matchTypeCounts.UPSTREAM_INVALID_EXCLUDED.DIRECT_SUPPORT),
            INDIRECT_SUPPORT: precision(matchTypeCounts.UPSTREAM_INVALID_EXCLUDED.INDIRECT_SUPPORT),
          },
          matchTypeCounts: matchTypeCounts.UPSTREAM_INVALID_EXCLUDED,
          note: "Excluded from clean denominator — invalid upstream Phase-5 requirements.",
        },
      },
      cleanExcludingUpstream: {
        denominatorPacketCount: stratumPacketCounts.SPEC_VALID + stratumPacketCounts.CONFIRMED_CORRECTED_SPEC,
        weightedTopKStrongValid: {
          top5: weightedMean(cleanTopK.top5),
          top10: weightedMean(cleanTopK.top10),
          top20: weightedMean(cleanTopK.top20),
        },
        matchTypePrecision: {
          EXACT: precision(matchTypeCounts.CLEAN_EXCLUDING_UPSTREAM.EXACT),
          DIRECT_SUPPORT: precision(matchTypeCounts.CLEAN_EXCLUDING_UPSTREAM.DIRECT_SUPPORT),
          INDIRECT_SUPPORT: precision(matchTypeCounts.CLEAN_EXCLUDING_UPSTREAM.INDIRECT_SUPPORT),
        },
        matchTypeCounts: matchTypeCounts.CLEAN_EXCLUDING_UPSTREAM,
        falseExactFunctionOverclaim: {
          irrelevantWithV1ExactClaim: falseExactTotalClean,
          stillOverclaimingAfterV11: falseExactStillClean,
          rate: falseExactTotalClean ? falseExactStillClean / falseExactTotalClean : null,
        },
        perFunctionCoverage: perFunctionCoverageClean,
        remainingFailureFamilies: failureFamilies,
      },
      allPacketsIncludingUpstream: {
        falseExactFunctionOverclaim: {
          irrelevantWithV1ExactClaim: falseExactTotal,
          stillOverclaimingAfterV11: falseExactStill,
          rate: falseExactTotal ? falseExactStill / falseExactTotal : null,
        },
        perFunctionCoverage,
      },
      perRequirementTopK: requirementRows,
    },
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  const clean = report.p14Metrics.cleanExcludingUpstream;
  console.log(`Clean P14 baseline: ${OUT_PATH}`);
  console.log(
    `Strata packets: SPEC_VALID=${stratumPacketCounts.SPEC_VALID} CONFIRMED=${stratumPacketCounts.CONFIRMED_CORRECTED_SPEC} UPSTREAM_EXCLUDED=${stratumPacketCounts.UPSTREAM_INVALID_EXCLUDED}`,
  );
  console.log(
    `Clean weighted top-5/10/20: ${clean.weightedTopKStrongValid.top5?.toFixed(3) ?? "n/a"} / ${clean.weightedTopKStrongValid.top10?.toFixed(3) ?? "n/a"} / ${clean.weightedTopKStrongValid.top20?.toFixed(3) ?? "n/a"}`,
  );
  console.log(
    `Clean EXACT/DIRECT/INDIRECT precision: ${((clean.matchTypePrecision.EXACT ?? 0) * 100).toFixed(1)}% / ${((clean.matchTypePrecision.DIRECT_SUPPORT ?? 0) * 100).toFixed(1)}% / ${((clean.matchTypePrecision.INDIRECT_SUPPORT ?? 0) * 100).toFixed(1)}%`,
  );
  console.log(
    `False-exact overclaim (clean): ${clean.falseExactFunctionOverclaim.stillOverclaimingAfterV11}/${clean.falseExactFunctionOverclaim.irrelevantWithV1ExactClaim}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
