#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Product current-surface evaluation v2.
 * Uses requirement provenance audit + upstream gap overlay v1.
 * REPORT AND WAIT — no independent labeling authorization.
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
import type { SemanticCandidateV11 } from "../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import type { FunctionalSemanticRequirement, IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";
import { bestMatchForGoldRequirement, functionStratum, rankForGoldRequirement } from "./lib/phase6a1-p14-metrics-v1";
import {
  getOverlayForCaseV131,
  P11_OVERLAY_CASE_IDS,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
} from "./lib/phase6a1-spec-correction-overlay-v1.3.1";
import { getFullyEffectiveSpec, CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION } from "./lib/phase6a1-contamination-correction-overlay-v1";
import { UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import {
  auditAllRequirementPairs,
  buildMateriallyChangedProductRequirementSet,
  buildProductRequirements,
  buildSentinelRequirements,
  REQUIREMENT_PROVENANCE_V1_VERSION,
  type RequirementProvenanceRecord,
} from "./lib/phase6a1-requirement-provenance-v1";
import {
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
const PROVENANCE_AUDIT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-requirement-provenance-audit-v1.json");
const OUT_DIR = resolve("data/milestones/deck-synthesis");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-evaluation-report-v2.json");
const COVERAGE_PATH = resolve(OUT_DIR, "phase6a1-current-surface-coverage-v2.json");
const SNAPSHOT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-snapshot-v2.json");
const BLINDED_PRODUCT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v2-product.json");
const BLINDED_SENTINEL_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v2-sentinel.json");
const SEALED_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-post-hoc-sealed-v2.json");
const FAILURE_PATH = resolve(OUT_DIR, "phase6a1-current-surface-failure-diagnostics-v2.json");

const SUPERSEDED_V1_BLINDED = "phase6a1-current-surface-delta-blinded-v1.json";

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

type SurfaceKind = "PRODUCT_CURRENT_SURFACE" | "EXTERNAL_SENTINEL_SURFACE";

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
  surfaceKind: SurfaceKind;
}) {
  const card = cardPresentation(input.catalog, input.candidateOracleId);
  return {
    category: input.category,
    surfaceKind: input.surfaceKind,
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

function evaluateRequirements(input: {
  surfaceKind: SurfaceKind;
  requirements: FunctionalSemanticRequirement[];
  provenanceByReqId: Map<string, RequirementProvenanceRecord>;
  materiallyChanged: Set<string>;
  c: (typeof EVAL_SETS)[number]["cases"][number];
  v11: ReturnType<typeof retrieveSemanticCandidatesV11>;
  effective: ReturnType<typeof getFullyEffectiveSpec>;
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
  label271: ReturnType<typeof loadFrozenLabelMaps>["label271"];
  label240: ReturnType<typeof loadFrozenLabelMaps>["label240"];
  commanderOracleTexts: Array<{ name: string; oracleText: string }>;
  commandZoneConfiguration: string;
  combinedColorIdentity: string[];
  allTuples: CurrentSurfaceTuple[];
  blindedPackets: Array<Record<string, unknown>>;
  sealedPostHoc: Array<Record<string, unknown>>;
  failuresA: Array<Record<string, unknown>>;
  failuresB: Array<Record<string, unknown>>;
  failuresC: Array<Record<string, unknown>>;
  failuresD: Array<Record<string, unknown>>;
  failuresE: Array<Record<string, unknown>>;
  includeInFailureDiagnostics: boolean;
}) {
  const reqRows: Array<Record<string, unknown>> = [];

  for (const req of input.requirements) {
    const prov = input.provenanceByReqId.get(req.requirementId);
    const ranked = rankForGoldRequirement(input.v11, req.linkedSpecFields).slice(0, 20);
    const reqChanged = input.materiallyChanged.has(req.requirementId);
    const reqTuples: CurrentSurfaceTuple[] = [];

    for (let i = 0; i < ranked.length; i++) {
      const candidate = ranked[i]!;
      const requirementRank = i + 1;
      const label = resolveLabel({
        caseId: input.c.id,
        requirementId: req.requirementId,
        candidateOracleId: candidate.oracleId,
        materiallyChanged: reqChanged,
        label271: input.label271,
        label240: input.label240,
      });
      const best = bestMatchForGoldRequirement(candidate.functionalMatches, req.linkedSpecFields);
      const match =
        candidate.functionalMatches.find((m) => m.requirementId === best.requirementId) ??
        candidate.functionalMatches.find((m) => req.linkedSpecFields.some((f) => f.endsWith(`:${m.requirementToken}`))) ??
        null;

      const tuple: CurrentSurfaceTuple = {
        tupleId: packetId(input.c.id, req.requirementId, candidate.oracleId),
        caseId: input.c.id,
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
      input.allTuples.push(tuple);

      if (label.labelSource === "UNLABELED") {
        const card = cardPresentation(input.catalog, candidate.oracleId);
        input.blindedPackets.push({
          packetId: tuple.tupleId,
          caseId: input.c.id,
          requirementId: req.requirementId,
          candidateOracleId: candidate.oracleId,
          surfaceKind: input.surfaceKind,
          reviewContext: {
            commandZoneConfiguration: input.commandZoneConfiguration,
            commandZoneMemberOracleTexts: input.commanderOracleTexts,
            combinedColorIdentity: input.combinedColorIdentity,
            bracket: input.c.bracket,
            effectivePhase6MechanicalDirection: input.effective.effectiveMechanicalDirection,
            effectiveCorrectedRetrievalSpecification: input.effective.spec,
            requirementProvenance: prov?.classification ?? null,
            requirement: {
              requirementId: req.requirementId,
              description: req.description,
              linkedSpecFields: req.linkedSpecFields,
              materiallyChangedFromFrozenPhase5: reqChanged,
              provenanceClassification: prov?.classification ?? null,
            },
            candidate: card,
          },
          reviewStatus: "PENDING_INDEPENDENT_REVIEW",
          note:
            input.surfaceKind === "PRODUCT_CURRENT_SURFACE"
              ? "Product current-surface delta — genuinely unlabeled tuple under fully effective Phase-6 spec."
              : "External sentinel diagnostic — not part of product acceptance precision denominators.",
        });
        input.sealedPostHoc.push(buildSealedPostHoc({ tuple, candidate, functionalMatch: match }));
      }

      if (input.includeInFailureDiagnostics && label.humanLabel) {
        const base = {
          caseId: input.c.id,
          commanders: input.c.commanders,
          requirement: req,
          candidateOracleId: candidate.oracleId,
          catalog: input.catalog,
          tuple,
          functionalMatch: match,
          commanderOracleTexts: input.commanderOracleTexts,
          effectiveMechanicalDirection: input.effective.effectiveMechanicalDirection,
          surfaceKind: input.surfaceKind,
        };
        if (label.humanLabel === "IRRELEVANT" && best.matchType === "EXACT") {
          input.failuresA.push(failureRecord({ ...base, category: "IRRELEVANT_WITH_EXACT_MATCH" }));
        }
        if (STRONG_VALID_LABELS.has(label.humanLabel) && best.matchType === "NONE") {
          input.failuresB.push(failureRecord({ ...base, category: "STRONG_VALID_WITH_NONE_SUPPORT" }));
        }
        if (STRONG_VALID_LABELS.has(label.humanLabel) && best.matchType === "ADJACENT") {
          input.failuresC.push(failureRecord({ ...base, category: "STRONG_VALID_ADJACENT_ONLY" }));
        }
        if (requirementRank <= 10 && label.humanLabel === "IRRELEVANT") {
          input.failuresD.push(failureRecord({ ...base, category: "TOP10_IRRELEVANT" }));
        }
        if (requirementRank <= 10 && label.humanLabel === "MECHANICALLY_WRONG") {
          input.failuresE.push(failureRecord({ ...base, category: "TOP10_MECHANICALLY_WRONG" }));
        }
      }
    }

    reqRows.push({
      caseId: input.c.id,
      requirementId: req.requirementId,
      provenanceClassification: prov?.classification ?? "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT",
      materiallyChangedFromFrozenPhase5: reqChanged,
      poolSize: input.v11.candidates.length,
      top20OracleIds: ranked.map((x) => x.oracleId),
      tupleLabelSources: reqTuples.map((t) => ({
        rank: t.requirementRank,
        oracleId: t.candidateOracleId,
        labelSource: t.labelSource,
        humanLabel: t.humanLabel,
      })),
    });
  }

  return reqRows;
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

  const productTuples: CurrentSurfaceTuple[] = [];
  const sentinelTuples: CurrentSurfaceTuple[] = [];
  const productSnapshots: Array<Record<string, unknown>> = [];
  const sentinelSnapshots: Array<Record<string, unknown>> = [];
  const productBlinded: Array<Record<string, unknown>> = [];
  const sentinelBlinded: Array<Record<string, unknown>> = [];
  const sealedPostHoc: Array<Record<string, unknown>> = [];
  const allProvenanceRecords: RequirementProvenanceRecord[] = [];

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

      const effective = getFullyEffectiveSpec(
        c.id,
        primary.retrievalSpecification,
        primary.mechanicalDescription,
        getOverlayForCaseV131(c.id),
      );

      const provenanceRecords = auditAllRequirementPairs({
        caseId: c.id,
        frozenSpec: primary.retrievalSpecification,
        fullyEffectiveSpec: effective.spec,
      });
      allProvenanceRecords.push(...provenanceRecords);
      const provenanceByReqId = new Map(provenanceRecords.map((r) => [r.requirementId, r]));

      const productRequirements = buildProductRequirements(effective.spec);
      const sentinelRequirements = buildSentinelRequirements(c.id).filter((req) => {
        const prov = provenanceByReqId.get(req.requirementId);
        return prov?.evaluateOnSentinelSurface ?? false;
      });

      const materiallyChangedProduct = buildMateriallyChangedProductRequirementSet({
        frozenSpec: primary.retrievalSpecification,
        fullyEffectiveSpec: effective.spec,
      });

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
      const commandZoneConfiguration = "commandZoneConfiguration" in c ? c.commandZoneConfiguration : "single_commander";

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

      const productReqRows = evaluateRequirements({
        surfaceKind: "PRODUCT_CURRENT_SURFACE",
        requirements: productRequirements,
        provenanceByReqId,
        materiallyChanged: materiallyChangedProduct,
        c,
        v11,
        effective,
        catalog,
        label271,
        label240,
        commanderOracleTexts,
        commandZoneConfiguration,
        combinedColorIdentity,
        allTuples: productTuples,
        blindedPackets: productBlinded,
        sealedPostHoc,
        failuresA,
        failuresB,
        failuresC,
        failuresD,
        failuresE,
        includeInFailureDiagnostics: true,
      });

      productSnapshots.push({
        caseId: c.id,
        commanders: c.commanders,
        surfaceKind: "PRODUCT_CURRENT_SURFACE",
        p11OverlayApplied: P11_OVERLAY_CASE_IDS.includes(c.id),
        upstreamGapOverlayApplied: effective.upstreamGapApplied,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        effectiveRetrievalSpecification: effective.spec,
        materiallyChangedRequirementIds: [...materiallyChangedProduct],
        requirements: productReqRows,
      });

      if (sentinelRequirements.length > 0) {
        const sentinelReqRows = evaluateRequirements({
          surfaceKind: "EXTERNAL_SENTINEL_SURFACE",
          requirements: sentinelRequirements,
          provenanceByReqId,
          materiallyChanged: new Set(sentinelRequirements.map((r) => r.requirementId)),
          c,
          v11,
          effective,
          catalog,
          label271,
          label240,
          commanderOracleTexts,
          commandZoneConfiguration,
          combinedColorIdentity,
          allTuples: sentinelTuples,
          blindedPackets: sentinelBlinded,
          sealedPostHoc,
          failuresA: [],
          failuresB: [],
          failuresC: [],
          failuresD: [],
          failuresE: [],
          includeInFailureDiagnostics: false,
        });

        sentinelSnapshots.push({
          caseId: c.id,
          commanders: c.commanders,
          surfaceKind: "EXTERNAL_SENTINEL_SURFACE",
          effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
          requirements: sentinelReqRows,
          note: "Diagnostic only — excluded from product acceptance precision denominators.",
        });
      }
    }
  }

  const productCoverage = {
    version: "phase6a1-current-surface-coverage-v2-product",
    generatedAt: new Date().toISOString(),
    surfaceKind: "PRODUCT_CURRENT_SURFACE",
    note: "Product acceptance surface only. External sentinel tuples excluded.",
    activeCaseRequirementPairs: productSnapshots.reduce((s, r) => s + ((r.requirements as unknown[])?.length ?? 0), 0),
    top5: slotCoverage(productTuples, 5),
    top10: slotCoverage(productTuples, 10),
    top20: slotCoverage(productTuples, 20),
    allCurrentTop20Tuples: {
      total: productTuples.length,
      labeled271: productTuples.filter((t) => t.labelSource === "FROZEN_271").length,
      labeled240: productTuples.filter((t) => t.labelSource === "FROZEN_240").length,
      unlabeled: productTuples.filter((t) => t.labelSource === "UNLABELED").length,
      labelCoverageRate: productTuples.length
        ? productTuples.filter((t) => t.labelSource !== "UNLABELED").length / productTuples.length
        : 0,
    },
    unlabeledDeltaPacketCount: productBlinded.length,
    removedFromV1: {
      obsoleteElshaTopOfLibraryPackets: 19,
      goldRequirementZeroLinkedFieldPackets: 76,
      note: "v1 714-artifact mixed gold requirements into product Top-20 without provenance separation.",
    },
  };

  const sentinelCoverage = {
    version: "phase6a1-current-surface-coverage-v2-sentinel",
    generatedAt: new Date().toISOString(),
    surfaceKind: "EXTERNAL_SENTINEL_SURFACE",
    note: "Diagnostic calibration gold — not product acceptance denominators.",
    activeCaseRequirementPairs: sentinelSnapshots.reduce((s, r) => s + ((r.requirements as unknown[])?.length ?? 0), 0),
    top20: slotCoverage(sentinelTuples, 20),
    allCurrentTop20Tuples: {
      total: sentinelTuples.length,
      labeled271: sentinelTuples.filter((t) => t.labelSource === "FROZEN_271").length,
      labeled240: sentinelTuples.filter((t) => t.labelSource === "FROZEN_240").length,
      unlabeled: sentinelTuples.filter((t) => t.labelSource === "UNLABELED").length,
    },
    unlabeledDeltaPacketCount: sentinelBlinded.length,
  };

  const otherFamilyBreakdown: Record<string, number> = {};
  for (const t of productTuples.filter((x) => x.labelSource !== "UNLABELED" && x.functionStratum === "other")) {
    otherFamilyBreakdown[t.semanticFamily] = (otherFamilyBreakdown[t.semanticFamily] ?? 0) + 1;
  }

  const failureDiagnostics = {
    version: "phase6a1-current-surface-failure-diagnostics-v2",
    generatedAt: new Date().toISOString(),
    scope: "PRODUCT_CURRENT_SURFACE labeled tuples only",
    retrievalImplementation: {
      functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
      retrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
      p11Overlay: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      upstreamGapOverlay: UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION,
      requirementProvenance: REQUIREMENT_PROVENANCE_V1_VERSION,
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
    version: "phase6a1-current-surface-evaluation-report-v2",
    generatedAt: new Date().toISOString(),
    authorization: {
      overlayV131: "ACCEPTED / FROZEN",
      upstreamGapOverlayV1: "AUTHORIZED / APPLIED",
      requirementProvenanceAudit: "AUTHORIZED / COMPLETE",
      supersededV1Blinded714: "SUPERSEDED_PRE_ADJUDICATION — DO NOT LABEL",
      productCurrentSurfaceRegeneration: "COMPLETE",
      independentLabeling: "WAIT — product blinded delta v2 only after review of this report",
      phase6A2Repair: "WAIT",
      scoreTuning: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    supersededArtifacts: {
      [SUPERSEDED_V1_BLINDED]: {
        status: "SUPERSEDED_PRE_ADJUDICATION",
        packetCount: 714,
        reason: "Gold requirements entered product Top-20 without active linked fields or provenance separation.",
        independentLabeling: "DO NOT START",
      },
    },
    implementationFrozen: {
      functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
      retrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
      overlayChain: [RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION, UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION],
    },
    surfaces: {
      PRODUCT_CURRENT_SURFACE: {
        coverage: COVERAGE_PATH,
        snapshot: SNAPSHOT_PATH,
        blindedDelta: BLINDED_PRODUCT_PATH,
        tupleCount: productTuples.length,
        unlabeledDeltaPackets: productBlinded.length,
      },
      EXTERNAL_SENTINEL_SURFACE: {
        blindedDelta: BLINDED_SENTINEL_PATH,
        tupleCount: sentinelTuples.length,
        unlabeledDeltaPackets: sentinelBlinded.length,
        note: "Diagnostic only — excluded from product acceptance precision.",
      },
    },
    provenanceAuditArtifact: PROVENANCE_AUDIT_PATH,
    productCoverage,
    sentinelCoverage,
    failureDiagnosticsSummary: failureDiagnostics.summary,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  writeFileSync(COVERAGE_PATH, JSON.stringify(productCoverage, null, 2));
  writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-snapshot-v2",
        generatedAt: new Date().toISOString(),
        surfaceKind: "PRODUCT_CURRENT_SURFACE",
        tupleCount: productTuples.length,
        requirementSnapshots: productSnapshots,
        sentinelSnapshots,
        provenanceRecords: allProvenanceRecords,
        tuples: productTuples,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    BLINDED_PRODUCT_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-delta-blinded-v2-product",
        generatedAt: new Date().toISOString(),
        surfaceKind: "PRODUCT_CURRENT_SURFACE",
        reviewStatus: "PENDING_INDEPENDENT_REVIEW",
        supersedes: SUPERSEDED_V1_BLINDED,
        postHocScoresArtifact: "phase6a1-current-surface-delta-post-hoc-sealed-v2.json",
        postHocScoresStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
        packetCount: productBlinded.length,
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
        note: "Product current-surface blind delta — obsolete and sentinel requirements excluded.",
        packets: productBlinded,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    BLINDED_SENTINEL_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-delta-blinded-v2-sentinel",
        generatedAt: new Date().toISOString(),
        surfaceKind: "EXTERNAL_SENTINEL_SURFACE",
        reviewStatus: "DIAGNOSTIC_OPTIONAL",
        packetCount: sentinelBlinded.length,
        note: "External gold/sentinel diagnostic — not product acceptance precision denominators.",
        packets: sentinelBlinded,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    SEALED_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-delta-post-hoc-sealed-v2",
        generatedAt: new Date().toISOString(),
        reviewStatus: "SEALED_UNTIL_INDEPENDENT_LABELS_FROZEN",
        recordCount: sealedPostHoc.length,
        note: "Reveal only after independent labels assigned for product-surface v2 delta packets.",
        recordsByPacketId: Object.fromEntries(sealedPostHoc.map((r) => [(r as { packetId: string }).packetId, r])),
      },
      null,
      2,
    ),
  );
  writeFileSync(FAILURE_PATH, JSON.stringify(failureDiagnostics, null, 2));

  console.log(`Current surface v2 report: ${REPORT_PATH}`);
  console.log(`Product tuples: ${productTuples.length} unlabeled delta: ${productBlinded.length}`);
  console.log(`Sentinel tuples: ${sentinelTuples.length} unlabeled delta: ${sentinelBlinded.length}`);
  console.log(
    `Product coverage top5/10/20: ${(productCoverage.top5.labelCoverageRate * 100).toFixed(1)}% / ${(productCoverage.top10.labelCoverageRate * 100).toFixed(1)}% / ${(productCoverage.top20.labelCoverageRate * 100).toFixed(1)}%`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
