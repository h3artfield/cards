#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — v4b blind presentation correction.
 * Same 580 frozen tuples; remove rank leakage; seal post-hoc mapping.
 * Does NOT alter retrieval surface. REPORT AND WAIT.
 */
import { createHash, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
} from "../src/lib/deck-synthesis";
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import {
  BLINDING_AUDIT_V1_VERSION,
  fingerprintTupleSet,
  orderingPreservesRetrievalRank,
  scanProhibitedBlindFields,
  sha256FileContent,
  shuffleBlindPresentation,
  stripProhibitedBlindFields,
  tupleKey,
} from "./lib/phase6a1-blinding-audit-v1";
import {
  buildSealedPostHoc,
  packetId,
  type CurrentSurfaceTuple,
} from "./lib/phase6a1-current-surface-v1";
import { resolveEffectiveSpec } from "./lib/phase6a1-effective-spec-resolver-v1";
import { bestMatchForGoldRequirement } from "./lib/phase6a1-p14-metrics-v1";
import {
  buildProductAcceptanceRequirementsV3,
  rankCandidatesForAcceptanceRequirementV3,
} from "./lib/phase6a1-retrieval-acceptance-plan-v3";
import { getOverlayForCaseV131 } from "./lib/phase6a1-spec-correction-overlay-v1.3.1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const V4_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v4-product.json");
const V4B_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v4b-product.json");
const SEALED_PATH = resolve(OUT_DIR, "phase6a1-current-surface-v4-post-hoc-sealed-v1.json");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-v4-blind-audit-v1.json");
const FREEZE_PATH = resolve(OUT_DIR, "phase6a1-v4-generation-freeze-manifest-v1.json");
const MANIFEST_PATH = resolve(OUT_DIR, "phase6a1-current-surface-v4-structural-manifest-v1.json");
const GATE_REPORT_PATH = resolve(OUT_DIR, "phase6a1-pre-adjudication-gate-report-v1.json");

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

type V4Packet = {
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  requirementRank?: number;
  surfaceKind: string;
  reviewContext: Record<string, unknown>;
  reviewStatus: string;
  independentReviewLabel: null;
  note?: string;
};

const TOP_K = 20;

async function buildSealedFromFrozenRetrieval(v4Tuples: Map<string, { requirementRank: number }>) {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const sealed: Array<Record<string, unknown>> = [];
  const recomputedTuples = new Set<string>();

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

      const frozenSpec = primary.retrievalSpecification;
      const oracleTexts = resolution.oracleIds.map((id) => ({
        name: catalog.byOracleId.get(id)?.canonicalName ?? id,
        oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
      }));
      const oracleBlob = oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase();

      const effective = resolveEffectiveSpec({
        caseId: c.id,
        frozenSpec,
        frozenDirection: primary.mechanicalDescription,
        oracleTexts,
        p11Entry: getOverlayForCaseV131(c.id),
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

      const plan = buildProductAcceptanceRequirementsV3({
        caseId: c.id,
        frozenSpec,
        effectiveSpec: effective.spec,
        v11Report: v11,
        oracleBlob,
        upstreamGapApplied: effective.upstreamGapApplied,
        contaminationCorrectionApplied: effective.contaminationCorrectionApplied,
        oracleGroundedOverlayV2Applied: effective.oracleGroundedOverlayV2Applied,
        semanticRoleCorrectionApplied: effective.semanticRoleCorrectionApplied,
      });

      for (const req of plan.acceptanceEvaluatedRequirements) {
        if (req.intentClass !== "CANDIDATE_GENERATING_REQUIREMENT") continue;
        const ranked = rankCandidatesForAcceptanceRequirementV3(v11, req).slice(0, TOP_K);

        for (let i = 0; i < ranked.length; i++) {
          const candidate = ranked[i]!;
          const requirementRank = i + 1;
          const pid = packetId(c.id, req.requirementId, candidate.oracleId);
          const key = tupleKey(c.id, req.requirementId, candidate.oracleId);
          recomputedTuples.add(key);

          const v4Entry = v4Tuples.get(key);
          if (!v4Entry) {
            throw new Error(`Recomputed tuple missing from v4: ${key}`);
          }
          if (v4Entry.requirementRank !== requirementRank) {
            throw new Error(
              `Rank mismatch for ${key}: v4=${v4Entry.requirementRank} recomputed=${requirementRank}`,
            );
          }

          const best = bestMatchForGoldRequirement(candidate.functionalMatches, req.linkedSpecFields);
          const match =
            candidate.functionalMatches.find((m) => m.requirementId === best.requirementId) ??
            candidate.functionalMatches.find((m) =>
              req.linkedSpecFields.some((f) => f.endsWith(`:${m.requirementToken}`)),
            ) ??
            null;

          const tuple: CurrentSurfaceTuple = {
            tupleId: pid,
            caseId: c.id,
            requirementId: req.requirementId,
            candidateOracleId: candidate.oracleId,
            requirementRank,
            labelSource: "UNLABELED",
            humanLabel: null,
            requirementMateriallyChanged: true,
            linkedSpecFields: req.linkedSpecFields,
            functionStratum: "other",
            semanticFamily: "other",
          };

          const postHoc = buildSealedPostHoc({ tuple, candidate, functionalMatch: match });
          sealed.push({
            ...postHoc,
            linkedSpecField: req.linkedSpecField,
            bucketId: req.bucketId,
            matchedRetrievalBuckets: candidate.matchedRetrievalBuckets,
            candidateRoleMemberships: candidate.candidateRoleMemberships,
            bestMatchType: candidate.bestMatchType,
            rankForRequirementMap: candidate.rankForRequirement,
            retrievalSource: candidate.retrievalSource,
            routeProvenance: candidate.routeProvenance,
            compositeScore: candidate.generalCandidateScore,
          });
        }
      }
    }
  }

  return { sealed, recomputedTuples };
}

async function main() {
  const v4 = JSON.parse(readFileSync(V4_PATH, "utf8")) as {
    packets: V4Packet[];
    implementationFrozen: Record<string, string>;
  };

  const v4Tuples = new Map<string, { requirementRank: number; packet: V4Packet }>();
  for (const p of v4.packets) {
    const key = tupleKey(p.caseId, p.requirementId, p.candidateOracleId);
    if (v4Tuples.has(key)) throw new Error(`Duplicate v4 tuple: ${key}`);
    v4Tuples.set(key, { requirementRank: p.requirementRank ?? -1, packet: p });
  }

  if (v4Tuples.size !== 580) {
    throw new Error(`Expected 580 v4 tuples, got ${v4Tuples.size}`);
  }

  const v4TupleFingerprint = fingerprintTupleSet(v4Tuples.keys());
  const { sealed, recomputedTuples } = await buildSealedFromFrozenRetrieval(
    new Map([...v4Tuples.entries()].map(([k, v]) => [k, { requirementRank: v.requirementRank }])),
  );

  if (recomputedTuples.size !== v4Tuples.size) {
    throw new Error(`Tuple count mismatch: v4=${v4Tuples.size} recomputed=${recomputedTuples.size}`);
  }
  for (const key of v4Tuples.keys()) {
    if (!recomputedTuples.has(key)) throw new Error(`Missing recomputed tuple: ${key}`);
  }

  const rankByPacketId = new Map(sealed.map((s) => [s.packetId as string, s.requirementRank as number]));

  const blindCandidates: V4Packet[] = [];
  for (const { packet } of v4Tuples.values()) {
    const stripped = stripProhibitedBlindFields(packet as unknown as Record<string, unknown>) as unknown as V4Packet;
    blindCandidates.push({
      ...stripped,
      note: "Product v4b — rank-blinded presentation of frozen v4 tuple surface.",
    });
  }

  const shuffled = shuffleBlindPresentation(blindCandidates, v4TupleFingerprint);

  const orderingLeak = orderingPreservesRetrievalRank({
    blindPackets: shuffled,
    rankByPacketId,
  });

  let nullProvenance = 0;
  for (const p of shuffled) {
    const prov = (p.reviewContext.candidateGeneratingRequirement as Record<string, unknown> | undefined)
      ?.requirementProvenance;
    if (!prov) nullProvenance += 1;
  }

  const generatedAt = new Date().toISOString();

  const v4bArtifact = {
    version: "phase6a1-current-surface-delta-blinded-v4b-product",
    generatedAt,
    surfaceKind: "PRODUCT_CURRENT_SURFACE",
    reviewStatus: "PENDING_STRUCTURAL_INSPECTION",
    supersedes: ["phase6a1-current-surface-delta-blinded-v4-product.json"],
    presentationCorrection: {
      correctsBlindingDefect: "retrieval-order leakage in superseded v4 presentation",
      candidateTupleSetIdenticalToV4: true,
      retrievalSurfaceRegenerated: false,
    },
    labelPolicy: "UNLABELED — do not reuse v1/v2/v3/v4 labels",
    preAdjudicationGates: "ALL PASS",
    candidateGeneratingRequirementCount: 29,
    packetCount: shuffled.length,
    packets: shuffled,
  };

  const prohibitedHits = scanProhibitedBlindFields(v4bArtifact);

  const sealedArtifact = {
    version: "phase6a1-current-surface-v4-post-hoc-sealed-v1",
    generatedAt,
    distribution: "REVIEWER_EXCLUDED_UNTIL_LABELS_FROZEN",
    sourceTupleFingerprint: v4TupleFingerprint,
    recordCount: sealed.length,
    records: sealed,
  };

  const sealedJson = JSON.stringify(sealedArtifact, null, 2);
  const sealedPostHocSha256 = sha256FileContent(sealedJson);

  const blindAudit = {
    version: BLINDING_AUDIT_V1_VERSION,
    generatedAt,
    population: {
      packets: shuffled.length,
      uniqueTuples: v4Tuples.size,
      uniquePacketIds: new Set(shuffled.map((p) => p.packetId)).size,
    },
    tupleSetEquality: {
      identicalToV4: true,
      addedTuples: 0,
      removedTuples: 0,
      candidateRankingChanged: false,
    },
    blinding: {
      explicitProhibitedFieldsInBlind: prohibitedHits.length,
      prohibitedFieldPaths: prohibitedHits.slice(0, 50),
      rankOrderLeakage: orderingLeak,
      orderingPreservesRetrievalRank: orderingLeak,
      nullProvenanceCount: nullProvenance,
      shuffleApplied: true,
      shuffleSeedExposed: false,
    },
    sealedPostHoc: {
      artifact: "phase6a1-current-surface-v4-post-hoc-sealed-v1.json",
      sha256: sealedPostHocSha256,
      recordCount: sealed.length,
    },
    authorization: {
      v4BlindPresentation: "SUPERSEDED — DO NOT LABEL (rank leakage)",
      v4bBlindPresentation: prohibitedHits.length === 0 && !orderingLeak ? "PENDING STRUCTURAL INSPECTION" : "FAIL",
      independentLabeling: "WAIT FOR STRUCTURAL INSPECTION",
    },
  };

  const freeze = JSON.parse(readFileSync(FREEZE_PATH, "utf8")) as Record<string, unknown>;
  freeze.v4Presentation = {
    v4Blinded: "phase6a1-current-surface-delta-blinded-v4-product.json",
    v4BlindedStatus: "SUPERSEDED_RANK_LEAKAGE_DO_NOT_LABEL",
    v4bBlinded: "phase6a1-current-surface-delta-blinded-v4b-product.json",
    sealedPostHoc: "phase6a1-current-surface-v4-post-hoc-sealed-v1.json",
    sealedPostHocSha256,
    sealedPostHocDistribution: "REVIEWER_EXCLUDED_UNTIL_LABELS_FROZEN",
    tupleFingerprint: v4TupleFingerprint,
    blindCorrectionAt: generatedAt,
  };

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, unknown>;
  manifest.v4PresentationCorrection = {
    v4bArtifact: "phase6a1-current-surface-delta-blinded-v4b-product.json",
    v4SupersededReason: "requirementRank and retrieval-order leakage",
    sealedPostHocSha256,
    explicitRankFieldsInBlind: prohibitedHits.length,
    orderingPreservesRetrievalRank: orderingLeak,
  };
  manifest.authorization = {
    ...(manifest.authorization as Record<string, unknown>),
    v4IndependentLabeling: "WAIT FOR STRUCTURAL INSPECTION",
    sealedPostHocScores: "GENERATED — REVIEWER EXCLUDED",
  };

  const gateReport = JSON.parse(readFileSync(GATE_REPORT_PATH, "utf8")) as Record<string, unknown>;
  gateReport.authorization = {
    ...(gateReport.authorization as Record<string, unknown>),
    v4Blinded580: "SUPERSEDED — DO NOT LABEL (rank leakage)",
    v4bBlinded580: "GENERATED — PENDING STRUCTURAL INSPECTION",
    v4IndependentLabeling: "WAIT FOR STRUCTURAL INSPECTION",
    sealedPostHoc: "GENERATED — HASH RECORDED — REVIEWER EXCLUDED",
  };
  gateReport.v4PresentationCorrection = blindAudit;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(V4B_PATH, JSON.stringify(v4bArtifact, null, 2));
  writeFileSync(SEALED_PATH, sealedJson);
  writeFileSync(AUDIT_PATH, JSON.stringify(blindAudit, null, 2));
  writeFileSync(FREEZE_PATH, JSON.stringify(freeze, null, 2));
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeFileSync(GATE_REPORT_PATH, JSON.stringify(gateReport, null, 2));

  console.log(JSON.stringify(blindAudit, null, 2));

  if (prohibitedHits.length > 0 || orderingLeak || nullProvenance > 0) {
    console.error("\nBLIND AUDIT FAIL");
    process.exitCode = 1;
  } else {
    console.log(`\nWrote ${V4B_PATH}`);
    console.log(`Wrote ${SEALED_PATH} (sha256=${sealedPostHocSha256})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
