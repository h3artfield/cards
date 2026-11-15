#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 changed/new candidate — post-hoc reveal + P14 metrics report.
 * No semantic repair. REPORT AND WAIT.
 */
import { execSync } from "node:child_process";
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
  scoreSaturation,
  topKHumanPrecision,
  type P14FunctionStratum,
} from "./lib/phase6a1-p14-metrics-v1";

loadProjectEnvLocal();

const ADJUDICATION_ARG = process.argv[2];
const FROZEN_240_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-adjudication-frozen-v1.json");
const MERGED_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-post-hoc-merged-v1.json");
const FROZEN_271_PATH = resolve("data/milestones/deck-synthesis/phase6a-development-adjudication-frozen-v1.json");
const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-p14-report-v1.json");

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

type MergedRecord = {
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  independentReviewLabel: IndependentCandidateLabel;
  independentReviewSpecStatus?: string | null;
  postHoc: {
    compositeScore: number;
    rankOverall: number;
    functionalRoleFit: number;
    commanderSemanticFit: number;
    directionFit: number;
    structuralFit: number;
    sampleTier: string;
  } | null;
};

function ensureFrozen240(): void {
  if (existsSync(FROZEN_240_PATH) && existsSync(MERGED_PATH) && !ADJUDICATION_ARG) return;
  const cmd = ADJUDICATION_ARG
    ? `npx tsx scripts/freeze-phase6a1-changed-candidate-adjudication-v1.ts "${ADJUDICATION_ARG}"`
    : `npx tsx scripts/freeze-phase6a1-changed-candidate-adjudication-v1.ts "c:/Users/h3art/Downloads/phase6a1-changed-candidate-independent-review-gpt56sol-v1.json"`;
  execSync(cmd, { cwd: resolve("."), stdio: "inherit" });
}

function weightedMean(values: Array<{ weight: number; value: number }>): number | null {
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (!totalWeight) return null;
  return values.reduce((s, v) => s + v.weight * v.value, 0) / totalWeight;
}

async function main() {
  ensureFrozen240();

  const merged = JSON.parse(readFileSync(MERGED_PATH, "utf8")) as {
    recordCount: number;
    labelTotals: Record<string, number>;
    records: MergedRecord[];
  };

  const frozen240 = JSON.parse(readFileSync(FROZEN_240_PATH, "utf8")) as {
    packets: Array<{
      packetId: string;
      reviewContext?: { requirement?: { linkedSpecFields?: string[] } };
    }>;
  };
  const linkedFieldsByPacket = new Map(
    frozen240.packets.map((p) => [p.packetId, p.reviewContext?.requirement?.linkedSpecFields ?? []]),
  );

  const labelByKey240 = new Map<string, IndependentCandidateLabel>();
  for (const r of merged.records) {
    labelByKey240.set(labelKey(r.caseId, r.requirementId, r.candidateOracleId), r.independentReviewLabel);
  }

  const labelByKeyAll = new Map(labelByKey240);
  if (existsSync(FROZEN_271_PATH)) {
    const frozen271 = JSON.parse(readFileSync(FROZEN_271_PATH, "utf8")) as {
      packets: Array<{ caseId: string; requirementId: string; candidateOracleId: string; independentReviewLabel: IndependentCandidateLabel | null }>;
    };
    for (const p of frozen271.packets) {
      if (!p.independentReviewLabel) continue;
      const key = labelKey(p.caseId, p.requirementId, p.candidateOracleId);
      if (!labelByKeyAll.has(key)) labelByKeyAll.set(key, p.independentReviewLabel);
    }
  }

  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const requirementTopK: Array<Record<string, unknown>> = [];
  const topKAggregate = {
    top5: [] as Array<{ weight: number; value: number }>,
    top10: [] as Array<{ weight: number; value: number }>,
    top20: [] as Array<{ weight: number; value: number }>,
    top5Viable: [] as Array<{ weight: number; value: number }>,
    top10Viable: [] as Array<{ weight: number; value: number }>,
    top20Viable: [] as Array<{ weight: number; value: number }>,
  };

  const zeroValidRequirements: Array<{ caseId: string; requirementId: string; stratum: P14FunctionStratum }> = [];
  const perFunctionCoverage: Record<P14FunctionStratum, { packetCount: number; strongValid: number; viable: number; irrelevant: number }> =
    Object.fromEntries(P14_FUNCTION_STRATA.map((s) => [s, { packetCount: 0, strongValid: 0, viable: 0, irrelevant: 0 }])) as Record<
      P14FunctionStratum,
      { packetCount: number; strongValid: number; viable: number; irrelevant: number }
    >;

  let exactLabeled = 0;
  let exactPositive = 0;
  let directLabeled = 0;
  let directPositive = 0;
  let falseExactTotal = 0;
  let falseExactStill = 0;

  const postHocScores: number[] = [];
  const rankOverallValues: number[] = [];
  const functionalFitValues: number[] = [];

  const packetPostHocAnalysis: Array<Record<string, unknown>> = [];

  for (const r of merged.records) {
    const linkedFields = linkedFieldsByPacket.get(r.packetId) ?? [];
    const stratum = functionStratum(r.requirementId, linkedFields);
    perFunctionCoverage[stratum].packetCount += 1;
    if (STRONG_VALID_LABELS.has(r.independentReviewLabel)) perFunctionCoverage[stratum].strongValid += 1;
    if (POSITIVE_HUMAN_LABELS.has(r.independentReviewLabel)) perFunctionCoverage[stratum].viable += 1;
    if (r.independentReviewLabel === "IRRELEVANT") perFunctionCoverage[stratum].irrelevant += 1;

    if (r.postHoc) {
      postHocScores.push(r.postHoc.compositeScore);
      rankOverallValues.push(r.postHoc.rankOverall);
      functionalFitValues.push(r.postHoc.functionalRoleFit);
    }
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
          retrievalSpecifications: [primary.retrievalSpecification],
          commandZoneComposition: discovery.commandZoneComposition,
          namedArchetype: null,
        },
        { catalog, shadowIndex, roleIndex, semanticNeighbors, gameChangerSnapshot },
      );

      const goldPreflight = preflightCaseGold({
        caseId: c.id,
        spec: primary.retrievalSpecification,
        catalog,
        combinedColorIdentity,
        bracket: c.bracket,
        gameChangerSnapshot,
      });

      for (const req of goldPreflight.functionalSemanticRequirements) {
        const stratum = functionStratum(req.requirementId, req.linkedSpecFields);
        const ranked = rankForGoldRequirement(v11, req.linkedSpecFields);
        const rankedOracleIds = ranked.map((x) => x.oracleId);

        const top5 = topKHumanPrecision(rankedOracleIds, 5, labelByKeyAll, c.id, req.requirementId);
        const top10 = topKHumanPrecision(rankedOracleIds, 10, labelByKeyAll, c.id, req.requirementId);
        const top20 = topKHumanPrecision(rankedOracleIds, 20, labelByKeyAll, c.id, req.requirementId);

        for (const [bucket, result, viableBucket] of [
          ["top5", top5, "top5Viable"],
          ["top10", top10, "top10Viable"],
          ["top20", top20, "top20Viable"],
        ] as const) {
          if (result.precisionStrongValid != null) {
            topKAggregate[bucket].push({ weight: result.labeledCountInTopK, value: result.precisionStrongValid });
          }
          if (result.precisionViableIncludingWeak != null) {
            topKAggregate[viableBucket].push({ weight: result.labeledCountInTopK, value: result.precisionViableIncludingWeak });
          }
        }

        const positivesIn240 = merged.records.filter(
          (r) => r.caseId === c.id && r.requirementId === req.requirementId && POSITIVE_HUMAN_LABELS.has(r.independentReviewLabel),
        ).length;
        if (positivesIn240 === 0) {
          zeroValidRequirements.push({ caseId: c.id, requirementId: req.requirementId, stratum });
        }

        requirementTopK.push({
          caseId: c.id,
          requirementId: req.requirementId,
          stratum,
          poolSize: ranked.length,
          top5,
          top10,
          top20,
          changedCandidatePositiveCount240: positivesIn240,
        });

        for (const r of merged.records.filter((x) => x.caseId === c.id && x.requirementId === req.requirementId)) {
          const cand = v11.candidates.find((x) => x.oracleId === r.candidateOracleId);
          if (!cand) continue;
          const match = bestMatchForGoldRequirement(cand.functionalMatches, req.linkedSpecFields);
          const v11Rank = ranked.findIndex((x) => x.oracleId === r.candidateOracleId) + 1;

          if (match.matchType === "EXACT") {
            exactLabeled += 1;
            if (POSITIVE_HUMAN_LABELS.has(r.independentReviewLabel)) exactPositive += 1;
          }
          if (match.matchType === "DIRECT_SUPPORT") {
            directLabeled += 1;
            if (POSITIVE_HUMAN_LABELS.has(r.independentReviewLabel)) directPositive += 1;
          }

          if (r.independentReviewLabel === "IRRELEVANT" && r.postHoc && r.postHoc.functionalRoleFit >= 0.99) {
            falseExactTotal += 1;
            if (matchTypeScore(match.matchType) >= 0.5) falseExactStill += 1;
          }

          packetPostHocAnalysis.push({
            packetId: r.packetId,
            caseId: c.id,
            requirementId: req.requirementId,
            stratum,
            candidateOracleId: r.candidateOracleId,
            independentReviewLabel: r.independentReviewLabel,
            v11RankForRequirement: v11Rank,
            v11MatchType: match.matchType,
            postHocFunctionalRoleFit: r.postHoc?.functionalRoleFit ?? null,
            postHocCompositeScore: r.postHoc?.compositeScore ?? null,
            postHocRankOverall: r.postHoc?.rankOverall ?? null,
          });
        }
      }
    }
  }

  const strongValid = merged.records.filter((r) => STRONG_VALID_LABELS.has(r.independentReviewLabel)).length;
  const viable = merged.records.filter((r) => POSITIVE_HUMAN_LABELS.has(r.independentReviewLabel)).length;

  const report = {
    version: "phase6a1-changed-candidate-p14-report-v1",
    retrievalVersion: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
    generatedAt: new Date().toISOString(),
    authorization: {
      phase6A1ChangedNewReview: "COMPLETE",
      furtherFunctionalSemanticTuning: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    frozenAdjudication: {
      changedNewFrozenArtifact: FROZEN_240_PATH,
      postHocMergedArtifact: MERGED_PATH,
      labeledPacketCount: merged.recordCount,
      expectedPacketCount: 240,
      postHocRevealedAfterIndependentLabels: true,
    },
    labelTotals: merged.labelTotals,
    changedNewSampleRates: {
      note: "Changed/new-candidate development adjudication — not directly comparable to original 271-packet 30.3% rate without sampling adjustment.",
      strongPlusValid: { count: strongValid, rate: strongValid / merged.recordCount },
      viableIncludingWeak: { count: viable, rate: viable / merged.recordCount },
      irrelevant: { count: merged.labelTotals.IRRELEVANT ?? 0, rate: (merged.labelTotals.IRRELEVANT ?? 0) / merged.recordCount },
    },
    independentQualitativeFindings: {
      cast_from_exile: "clearly improved",
      counter_synergy: "clearly improved",
      mill: "remains strong",
      graveyard_indirect_support: "must preserve INDIRECT_SUPPORT — not every useful card performs final zone transition",
      untap: "still poor in newly surfaced candidates",
      meren_death_payoff_density: "still poor",
      contextual_card_draw: "still overbroad in some cases",
    },
    p14Metrics: {
      humanRequirementSpecificTopKPrecision: {
        labelSource: "frozen 240 + frozen 271 where same case×requirement×candidate labeled",
        weightedMeanStrongValid: {
          top5: weightedMean(topKAggregate.top5),
          top10: weightedMean(topKAggregate.top10),
          top20: weightedMean(topKAggregate.top20),
        },
        weightedMeanViableIncludingWeak: {
          top5: weightedMean(topKAggregate.top5Viable),
          top10: weightedMean(topKAggregate.top10Viable),
          top20: weightedMean(topKAggregate.top20Viable),
        },
        perRequirement: requirementTopK,
      },
      exactMatchPrecision: exactLabeled ? exactPositive / exactLabeled : null,
      directSupportPrecision: directLabeled ? directPositive / directLabeled : null,
      exactMatchCounts: { labeled: exactLabeled, positive: exactPositive },
      directSupportCounts: { labeled: directLabeled, positive: directPositive },
      perFunctionRecallCoverage: perFunctionCoverage,
      zeroValidCandidateRequirements: zeroValidRequirements,
      falseExactFunctionMatchRate: {
        onChangedNew240: {
          irrelevantWithPostHocFunctionalRoleFit1: falseExactTotal,
          stillOverclaimingAfterV11Match: falseExactStill,
          rate: falseExactTotal ? falseExactStill / falseExactTotal : null,
        },
      },
      functionalMatchEvidenceCorrectness: {
        note: "Alignment of v1.1 FunctionalMatch type vs independent label on 240 changed/new packets.",
        exactMatchPrecision: exactLabeled ? exactPositive / exactLabeled : null,
        directSupportPrecision: directLabeled ? directPositive / directLabeled : null,
      },
      scoreRankDiscrimination: {
        postHocComposite: scoreSaturation(postHocScores),
        postHocFunctionalRoleFitUnique: new Set(functionalFitValues.map((v) => Math.round(v * 1000) / 1000)).size,
        postHocRankOverallUnique: new Set(rankOverallValues).size,
      },
    },
    postHocComparisonSample: packetPostHocAnalysis.slice(0, 40),
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  console.log(`P14 report: ${OUT_PATH}`);
  console.log(`Changed/new labels: ${merged.recordCount}/240`);
  console.log(`STRONG+VALID: ${strongValid} (${((strongValid / merged.recordCount) * 100).toFixed(1)}%)`);
  console.log(
    `Weighted top-5/10/20 STRONG+VALID precision: ${weightedMean(topKAggregate.top5)?.toFixed(3) ?? "n/a"} / ${weightedMean(topKAggregate.top10)?.toFixed(3) ?? "n/a"} / ${weightedMean(topKAggregate.top20)?.toFixed(3) ?? "n/a"}`,
  );
  console.log(`EXACT precision: ${exactLabeled ? ((exactPositive / exactLabeled) * 100).toFixed(1) : "n/a"}% (${exactPositive}/${exactLabeled})`);
  console.log(`DIRECT precision: ${directLabeled ? ((directPositive / directLabeled) * 100).toFixed(1) : "n/a"}% (${directPositive}/${directLabeled})`);
  console.log(`False-exact still overclaiming (240): ${falseExactStill}/${falseExactTotal}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
