#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Current retrieval surface evaluation under overlay v1.3.1.
 * No retriever changes. REPORT AND WAIT.
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
} from "../src/lib/deck-synthesis";
import { FUNCTIONAL_MATCH_V1_VERSION } from "../src/lib/deck-synthesis/functional-match-v1";
import type { FunctionalMatch } from "../src/lib/deck-synthesis/functional-match-v1";
import type { RetrievalSpecification } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { SemanticCandidateV11 } from "../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import { getCalibrationCaseIds, preflightCaseGold } from "./lib/phase6a-calibration-v2-gold";
import type { FunctionalSemanticRequirement, IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";
import {
  bestMatchForGoldRequirement,
  functionStratum,
  rankForGoldRequirement,
} from "./lib/phase6a1-p14-metrics-v1";
import {
  getEffectiveSpecForCase,
  P11_OVERLAY_CASE_IDS,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
} from "./lib/phase6a1-spec-correction-overlay-v1.3.1";
import {
  buildMateriallyChangedRequirementSet,
  buildSealedPostHoc,
  cardPresentation,
  type CurrentSurfaceTuple,
  inferSemanticFamily,
  loadFrozenLabelMaps,
  packetId,
  POSITIVE_LABELS,
  resolveLabel,
  STRONG_VALID_LABELS,
} from "./lib/phase6a1-current-surface-v1";

loadProjectEnvLocal();

const FROZEN_271_PATH = resolve("data/milestones/deck-synthesis/phase6a-development-adjudication-frozen-v1.json");
const FROZEN_240_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-adjudication-frozen-v1.json");
const OUT_DIR = resolve("data/milestones/deck-synthesis");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-evaluation-report-v1.json");
const COVERAGE_PATH = resolve(OUT_DIR, "phase6a1-current-surface-coverage-v1.json");
const SNAPSHOT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-snapshot-v1.json");
const BLINDED_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v1.json");
const SEALED_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-post-hoc-sealed-v1.json");
const FAILURE_PATH = resolve(OUT_DIR, "phase6a1-current-surface-failure-diagnostics-v1.json");

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

type SlotCoverage = {
  totalSlots: number;
  labeled271: number;
  labeled240: number;
  unlabeled: number;
  labelCoverageRate: number;
};

function slotCoverage(tuples: CurrentSurfaceTuple[], k: number): SlotCoverage {
  const slots = tuples.filter((t) => t.requirementRank <= k);
  const labeled271 = slots.filter((t) => t.labelSource === "FROZEN_271").length;
  const labeled240 = slots.filter((t) => t.labelSource === "FROZEN_240").length;
  const unlabeled = slots.filter((t) => t.labelSource === "UNLABELED").length;
  const totalSlots = slots.length;
  return {
    totalSlots,
    labeled271,
    labeled240,
    unlabeled,
    labelCoverageRate: totalSlots ? (labeled271 + labeled240) / totalSlots : 0,
  };
}

function failureRecord(input: {
  category: string;
  caseId: string;
  commanders: string[];
  requirement: FunctionalSemanticRequirement;
  candidateOracleId: string;
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
  tuple: CurrentSurfaceTuple;
  functionalMatch: FunctionalMatch | null;
  commanderOracleTexts: Array<{ name: string; oracleText: string }>;
  effectiveMechanicalDirection: string;
}) {
  const card = cardPresentation(input.catalog, input.candidateOracleId);
  return {
    category: input.category,
    caseId: input.caseId,
    commanders: input.commanders,
    commanderOracleTexts: input.commanderOracleTexts,
    requirementId: input.requirement.requirementId,
    requirementDescription: input.requirement.description,
    linkedSpecFields: input.requirement.linkedSpecFields,
    effectiveMechanicalDirection: input.effectiveMechanicalDirection,
    requirementRank: input.tuple.requirementRank,
    candidateOracleId: input.candidateOracleId,
    candidateName: card.canonicalName,
    candidateOracleText: card.oracleText,
    currentFunctionalMatch: input.functionalMatch,
    evidence: input.functionalMatch?.evidenceRefs ?? [],
    typedMechanism: input.functionalMatch?.mechanism ?? null,
    humanLabel: input.tuple.humanLabel,
    labelSource: input.tuple.labelSource,
    likelyFailureFamily: input.tuple.semanticFamily,
    functionStratum: input.tuple.functionStratum,
  };
}

async function main() {
  if (!existsSync(FROZEN_271_PATH)) throw new Error(`Missing ${FROZEN_271_PATH}`);
  if (!existsSync(FROZEN_240_PATH)) throw new Error(`Missing ${FROZEN_240_PATH}`);

  const frozen271 = JSON.parse(readFileSync(FROZEN_271_PATH, "utf8")) as { packets: Array<Record<string, unknown>> };
  const frozen240 = JSON.parse(readFileSync(FROZEN_240_PATH, "utf8")) as { packets: Array<Record<string, unknown>> };
  const { label271, label240 } = loadFrozenLabelMaps({
    frozen271Packets: frozen271.packets as never,
    frozen240Packets: frozen240.packets as never,
  });

  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const allTuples: CurrentSurfaceTuple[] = [];
  const requirementSnapshots: Array<Record<string, unknown>> = [];
  const blindedPackets: Array<Record<string, unknown>> = [];
  const sealedPostHoc: Array<Record<string, unknown>> = [];

  const failuresA: Array<Record<string, unknown>> = [];
  const failuresB: Array<Record<string, unknown>> = [];
  const failuresC: Array<Record<string, unknown>> = [];
  const failuresD: Array<Record<string, unknown>> = [];
  const failuresE: Array<Record<string, unknown>> = [];

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
      const frozenGold = preflightCaseGold({
        caseId: c.id,
        spec: primary.retrievalSpecification,
        catalog,
        combinedColorIdentity:
          discovery.commandZoneComposition?.combinedColorIdentity ??
          resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []),
        bracket: c.bracket,
        gameChangerSnapshot,
      });
      const effectiveGold = preflightCaseGold({
        caseId: c.id,
        spec: effective.spec,
        catalog,
        combinedColorIdentity:
          discovery.commandZoneComposition?.combinedColorIdentity ??
          resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []),
        bracket: c.bracket,
        gameChangerSnapshot,
      });

      const materiallyChanged = buildMateriallyChangedRequirementSet(
        frozenGold.functionalSemanticRequirements,
        effectiveGold.functionalSemanticRequirements,
      );

      const profile = buildCommanderMechanicalProfile({
        commanderOracleIds: resolution.oracleIds,
        catalogByOracleId: catalog.byOracleId,
        shadowIndex,
      })!;
      const motifs = extractMechanicalMotifs(profile);
      const anchors = extractDirectionAnchors({ profile, motifs });
      const combinedColorIdentity = [
        ...new Set(
          discovery.commandZoneComposition?.combinedColorIdentity ??
            resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []),
        ),
      ];
      const roleIndex = filterCatalogRoleIndex(globalIndex, combinedColorIdentity);
      const commandZoneConfiguration =
        "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander";

      const v11 = retrieveSemanticCandidatesV11(
        {
          commandZoneConfiguration,
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

      const commanderOracleTexts = resolution.oracleIds.map((id) => ({
        name: catalog.byOracleId.get(id)?.canonicalName ?? id,
        oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
      }));

      const reqRows: Array<Record<string, unknown>> = [];

      for (const req of effectiveGold.functionalSemanticRequirements) {
        const ranked = rankForGoldRequirement(v11, req.linkedSpecFields).slice(0, 20);
        const reqChanged = materiallyChanged.has(req.requirementId);
        const reqTuples: CurrentSurfaceTuple[] = [];

        for (let i = 0; i < ranked.length; i++) {
          const candidate = ranked[i]!;
          const requirementRank = i + 1;
          const label = resolveLabel({
            caseId: c.id,
            requirementId: req.requirementId,
            candidateOracleId: candidate.oracleId,
            materiallyChanged: reqChanged,
            label271,
            label240,
          });
          const best = bestMatchForGoldRequirement(candidate.functionalMatches, req.linkedSpecFields);
          const match =
            candidate.functionalMatches.find((m) => m.requirementId === best.requirementId) ??
            candidate.functionalMatches.find((m) => req.linkedSpecFields.some((f) => f.endsWith(`:${m.requirementToken}`))) ??
            null;

          const tuple: CurrentSurfaceTuple = {
            tupleId: packetId(c.id, req.requirementId, candidate.oracleId),
            caseId: c.id,
            requirementId: req.requirementId,
            candidateOracleId: candidate.oracleId,
            requirementRank,
            labelSource: label.labelSource,
            humanLabel: label.humanLabel,
            requirementMateriallyChanged: reqChanged,
            linkedSpecFields: req.linkedSpecFields,
            functionStratum: functionStratum(req.requirementId, req.linkedSpecFields),
            semanticFamily: inferSemanticFamily(req.requirementId, req.linkedSpecFields, match),
          };
          reqTuples.push(tuple);
          allTuples.push(tuple);

          if (label.labelSource === "UNLABELED") {
            const card = cardPresentation(catalog, candidate.oracleId);
            blindedPackets.push({
              packetId: tuple.tupleId,
              caseId: c.id,
              requirementId: req.requirementId,
              candidateOracleId: candidate.oracleId,
              reviewContext: {
                commandZoneConfiguration,
                commandZoneMemberOracleTexts: commanderOracleTexts,
                combinedColorIdentity,
                bracket: c.bracket,
                effectivePhase6MechanicalDirection: effective.effectiveMechanicalDirection,
                effectiveCorrectedRetrievalSpecification: effective.spec,
                requirement: {
                  requirementId: req.requirementId,
                  description: req.description,
                  linkedSpecFields: req.linkedSpecFields,
                  materiallyChangedFromFrozenPhase5: reqChanged,
                },
                candidate: card,
              },
              reviewStatus: "PENDING_INDEPENDENT_REVIEW",
              note: "Current-surface delta — genuinely unlabeled tuple under v1.3.1 effective spec.",
            });
            sealedPostHoc.push(buildSealedPostHoc({ tuple, candidate, functionalMatch: match }));
          }

          if (label.humanLabel) {
            const base = {
              caseId: c.id,
              commanders: c.commanders,
              requirement: req,
              candidateOracleId: candidate.oracleId,
              catalog,
              tuple,
              functionalMatch: match,
              commanderOracleTexts,
              effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
            };
            if (label.humanLabel === "IRRELEVANT" && best.matchType === "EXACT") {
              failuresA.push(failureRecord({ ...base, category: "IRRELEVANT_WITH_EXACT_MATCH" }));
            }
            if (STRONG_VALID_LABELS.has(label.humanLabel) && best.matchType === "NONE") {
              failuresB.push(failureRecord({ ...base, category: "STRONG_VALID_WITH_NONE_SUPPORT" }));
            }
            if (STRONG_VALID_LABELS.has(label.humanLabel) && best.matchType === "ADJACENT") {
              failuresC.push(failureRecord({ ...base, category: "STRONG_VALID_ADJACENT_ONLY" }));
            }
            if (requirementRank <= 10 && label.humanLabel === "IRRELEVANT") {
              failuresD.push(failureRecord({ ...base, category: "TOP10_IRRELEVANT" }));
            }
            if (requirementRank <= 10 && label.humanLabel === "MECHANICALLY_WRONG") {
              failuresE.push(failureRecord({ ...base, category: "TOP10_MECHANICALLY_WRONG" }));
            }
          }
        }

        reqRows.push({
          caseId: c.id,
          requirementId: req.requirementId,
          materiallyChangedFromFrozenPhase5: reqChanged,
          poolSize: v11.candidates.length,
          top20OracleIds: ranked.map((x) => x.oracleId),
          tupleLabelSources: reqTuples.map((t) => ({
            rank: t.requirementRank,
            oracleId: t.candidateOracleId,
            labelSource: t.labelSource,
            humanLabel: t.humanLabel,
          })),
        });
      }

      requirementSnapshots.push({
        caseId: c.id,
        commanders: c.commanders,
        overlayApplied: P11_OVERLAY_CASE_IDS.includes(c.id),
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        effectiveRetrievalSpecification: effective.spec,
        materiallyChangedRequirementIds: [...materiallyChanged],
        requirements: reqRows,
      });
    }
  }

  const coverage = {
    version: "phase6a1-current-surface-coverage-v1",
    generatedAt: new Date().toISOString(),
    note: "Label coverage on current requirement-specific ranking slots. Do not compute precision by silently dropping unlabeled slots.",
    activeCaseRequirementPairs: requirementSnapshots.reduce((s, r) => s + ((r.requirements as unknown[])?.length ?? 0), 0),
    top5: slotCoverage(allTuples, 5),
    top10: slotCoverage(allTuples, 10),
    top20: slotCoverage(allTuples, 20),
    allCurrentTop20Tuples: {
      total: allTuples.length,
      labeled271: allTuples.filter((t) => t.labelSource === "FROZEN_271").length,
      labeled240: allTuples.filter((t) => t.labelSource === "FROZEN_240").length,
      unlabeled: allTuples.filter((t) => t.labelSource === "UNLABELED").length,
      labelCoverageRate: allTuples.length
        ? allTuples.filter((t) => t.labelSource !== "UNLABELED").length / allTuples.length
        : 0,
    },
    unlabeledDeltaPacketCount: blindedPackets.length,
  };

  const otherFamilyBreakdown: Record<string, number> = {};
  for (const t of allTuples.filter((x) => x.labelSource !== "UNLABELED" && x.functionStratum === "other")) {
    otherFamilyBreakdown[t.semanticFamily] = (otherFamilyBreakdown[t.semanticFamily] ?? 0) + 1;
  }

  const failureDiagnostics = {
    version: "phase6a1-current-surface-failure-diagnostics-v1",
    generatedAt: new Date().toISOString(),
    scope: "Already-labeled development tuples only — current v1.3.1 requirement-specific ranking",
    retrievalImplementation: {
      functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
      retrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
      overlay: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
    },
    summary: {
      irrelevantWithExactMatch: failuresA.length,
      strongValidWithNoneSupport: failuresB.length,
      strongValidAdjacentOnly: failuresC.length,
      top10Irrelevant: failuresD.length,
      top10MechanicallyWrong: failuresE.length,
      otherBucketDecomposition: otherFamilyBreakdown,
    },
    failures: {
      A_irrelevantWithExactMatch: failuresA,
      B_strongValidWithNoneSupport: failuresB,
      C_strongValidAdjacentOnly: failuresC,
      D_top10Irrelevant: failuresD.sort((a, b) => (a.requirementRank as number) - (b.requirementRank as number)),
      E_top10MechanicallyWrong: failuresE.sort((a, b) => (a.requirementRank as number) - (b.requirementRank as number)),
    },
  };

  const report = {
    version: "phase6a1-current-surface-evaluation-report-v1",
    generatedAt: new Date().toISOString(),
    authorization: {
      overlayV131: "ACCEPTED / FROZEN",
      residualAudit: "ACCEPTED / 8 OF 8",
      frozen271CleanP14: "ACCEPTED AS DEVELOPMENT DIAGNOSTIC",
      phase6AFreeze: "NOT ACCEPTED",
      currentSurfaceEvaluation: "COMPLETE",
      blindedDeltaReview: "REQUIRED",
      phase6A2Repair: "WAIT",
      scoreTuning: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    implementationFrozen: {
      functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
      retrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
      overlay: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      note: "No retriever changes during current-surface delta review.",
    },
    artifacts: {
      coverage: COVERAGE_PATH,
      snapshot: SNAPSHOT_PATH,
      blindedDelta: BLINDED_PATH,
      sealedPostHoc: SEALED_PATH,
      failureDiagnostics: FAILURE_PATH,
    },
    coverage,
    blindedDelta: {
      packetCount: blindedPackets.length,
      sealedPostHocRecordCount: sealedPostHoc.length,
      reviewStatus: "PENDING_INDEPENDENT_REVIEW",
    },
    failureDiagnosticsSummary: failureDiagnostics.summary,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  writeFileSync(COVERAGE_PATH, JSON.stringify(coverage, null, 2));
  writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-snapshot-v1",
        generatedAt: new Date().toISOString(),
        tupleCount: allTuples.length,
        requirementSnapshots,
        tuples: allTuples,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    BLINDED_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-delta-blinded-v1",
        generatedAt: new Date().toISOString(),
        reviewStatus: "PENDING_INDEPENDENT_REVIEW",
        postHocScoresArtifact: "phase6a1-current-surface-delta-post-hoc-sealed-v1.json",
        postHocScoresStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
        packetCount: blindedPackets.length,
        prohibitedAdjudicationInputs: [
          "rankForRequirement",
          "rankOverall",
          "generalCandidateScore",
          "functionalRoleFit",
          "compositeScore",
          "automatedProxyLabel",
          "matchType",
          "retrievalTier",
          "previousCandidatePerformance",
        ],
        note: "Blind delta for genuinely unlabeled current Top-20 tuples only.",
        packets: blindedPackets,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    SEALED_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-delta-post-hoc-sealed-v1",
        generatedAt: new Date().toISOString(),
        reviewStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
        recordCount: sealedPostHoc.length,
        note: "Reveal only after independent labels assigned for current-surface delta packets.",
        recordsByPacketId: Object.fromEntries(sealedPostHoc.map((r) => [(r as { packetId: string }).packetId, r])),
      },
      null,
      2,
    ),
  );
  writeFileSync(FAILURE_PATH, JSON.stringify(failureDiagnostics, null, 2));

  console.log(`Current surface report: ${REPORT_PATH}`);
  console.log(`Coverage: top5=${(coverage.top5.labelCoverageRate * 100).toFixed(1)}% top10=${(coverage.top10.labelCoverageRate * 100).toFixed(1)}% top20=${(coverage.top20.labelCoverageRate * 100).toFixed(1)}%`);
  console.log(`Unlabeled delta packets: ${blindedPackets.length}`);
  console.log(`Failures A/B/C/D/E: ${failuresA.length}/${failuresB.length}/${failuresC.length}/${failuresD.length}/${failuresE.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
