#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — v4 product blind corpus generation.
 * Frozen implementation; candidate-generating requirements only.
 * REPORT AND WAIT — no independent labeling.
 */
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
  retrieveSemanticCandidatesV11,
  SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
} from "../src/lib/deck-synthesis";
import { FUNCTIONAL_MATCH_V1_VERSION } from "../src/lib/deck-synthesis/functional-match-v1";
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import {
  auditCaseFieldRoleGateC,
  CASE_SPECIFIC_ORACLE_AUDIT_V3_VERSION,
} from "./lib/phase6a1-case-specific-oracle-audit-v3";
import { cardPresentation, packetId } from "./lib/phase6a1-current-surface-v1";
import { CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION } from "./lib/phase6a1-contamination-correction-overlay-v1";
import { resolveEffectiveSpec, EFFECTIVE_SPEC_RESOLVER_V1_VERSION } from "./lib/phase6a1-effective-spec-resolver-v1";
import { ORACLE_GROUNDED_OVERLAY_V2_VERSION } from "./lib/phase6a1-oracle-grounded-overlay-v2";
import { RETRIEVAL_BUCKET_MAP_V1_VERSION } from "./lib/phase6a1-retrieval-bucket-map-v1";
import {
  buildProductAcceptanceRequirementsV3,
  rankCandidatesForAcceptanceRequirementV3,
  RETRIEVAL_ACCEPTANCE_PLAN_V3_VERSION,
  type ProductAcceptanceRequirementV3,
} from "./lib/phase6a1-retrieval-acceptance-plan-v3";
import { SEMANTIC_ROLE_ADJUDICATION_V1_VERSION } from "./lib/phase6a1-semantic-role-correction-overlay-v1";
import { UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import {
  getOverlayForCaseV131,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
} from "./lib/phase6a1-spec-correction-overlay-v1.3.1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const BLINDED_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v4-product.json");
const MANIFEST_PATH = resolve(OUT_DIR, "phase6a1-current-surface-v4-structural-manifest-v1.json");
const FREEZE_PATH = resolve(OUT_DIR, "phase6a1-v4-generation-freeze-manifest-v1.json");
const RECONCILIATION_PATH = resolve(OUT_DIR, "phase6a1-retrieval-bucket-reconciliation-v4.json");
const GATE_REPORT_PATH = resolve(OUT_DIR, "phase6a1-pre-adjudication-gate-report-v1.json");
const ORACLE_AUDIT_PATH = resolve(OUT_DIR, "phase6a1-effective-spec-oracle-audit-v3.json");
const FIELD_ROLE_PATH = resolve(OUT_DIR, "phase6a1-field-role-adjudication-v1.json");

const IMPLEMENTATION_FROZEN = {
  effectiveSpecResolver: EFFECTIVE_SPEC_RESOLVER_V1_VERSION,
  semanticRoleAdjudication: SEMANTIC_ROLE_ADJUDICATION_V1_VERSION,
  oracleAudit: CASE_SPECIFIC_ORACLE_AUDIT_V3_VERSION,
  retrievalBucketMap: RETRIEVAL_BUCKET_MAP_V1_VERSION,
  functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
  candidateRetrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
  acceptancePlan: RETRIEVAL_ACCEPTANCE_PLAN_V3_VERSION,
  requirementSpecificRanking: "semantic-candidate-retrieval-v1.1:rankForRequirement",
};

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

const TOP_K = 20;

function slotCount(packets: Array<{ requirementRank: number }>, k: number): number {
  return packets.filter((p) => p.requirementRank <= k).length;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const packets: Array<Record<string, unknown>> = [];
  const reconciliations: Array<Record<string, unknown>> = [];
  const fieldRoleAudits: Array<Record<string, unknown>> = [];
  const gateBAcceptedRequirements = new Set<string>();
  const v4RequirementKeys = new Set<string>();
  const packetCountsPerRequirement: Record<string, number> = {};
  const requirementsUnder20: Array<{ caseId: string; requirementId: string; actualCount: number }> = [];
  const zeroCandidateRequirements: Array<{ caseId: string; requirementId: string; linkedSpecField: string }> = [];
  const productCaseIds = new Set<string>();

  let nullProvenanceCount = 0;

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

      productCaseIds.add(c.id);
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

      const oracleAudit = auditCaseFieldRoleGateC({
        caseId: c.id,
        effectiveSpec: effective.spec,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        oracleTexts,
        preCorrectionSpec: effective.preSemanticRoleSpec,
      });

      if (!oracleAudit.gateCPass) {
        throw new Error(`Gate C failed for ${c.id} during v4 generation: ${oracleAudit.gateCFailures.join("; ")}`);
      }

      fieldRoleAudits.push({
        caseId: c.id,
        commanders: c.commanders,
        gateCPass: oracleAudit.gateCPass,
        fieldRoleReports: oracleAudit.fieldRoleReports,
        overlayChain: effective.overlayChain,
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

      if (!plan.reconciliationPass) {
        throw new Error(`Gate B failed for ${c.id} during v4 generation`);
      }

      const matchConstraints = plan.matchConstraints.map((m) => ({
        linkedSpecField: m.linkedSpecField,
        semanticRole: m.semanticRole,
        evaluationContract: m.evaluationContract,
      }));

      const outputAndPayoffContext = plan.contextIntents
        .filter((i) => i.intentClass === "OUTPUT_OR_PAYOFF_CONTEXT")
        .map((i) => ({
          linkedSpecField: i.linkedSpecField,
          semanticRole: i.semanticRole,
          sourceSpecField: i.sourceSpecField,
          sourceSpecValue: i.sourceSpecValue,
        }));

      const zoneAndSupportContext = plan.contextIntents
        .filter((i) => i.intentClass === "STATE_OR_ZONE_CONTEXT" || i.intentClass === "GENERIC_SUPPORT_CONTEXT")
        .map((i) => ({
          linkedSpecField: i.linkedSpecField,
          intentClass: i.intentClass,
          sourceSpecField: i.sourceSpecField,
          sourceSpecValue: i.sourceSpecValue,
        }));

      reconciliations.push({
        caseId: c.id,
        commanders: c.commanders,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        overlayChain: effective.overlayChain,
        candidateGeneratingIntentCount: plan.candidateGeneratingIntents.length,
        matchConstraintCount: plan.matchConstraints.length,
        contextIntentCount: plan.contextIntents.length,
        executedRetrievalBuckets: plan.executedRetrievalBuckets,
        reconciliationPass: plan.reconciliationPass,
        acceptanceRequirements: plan.acceptanceEvaluatedRequirements.map((r) => ({
          requirementId: r.requirementId,
          linkedSpecField: r.linkedSpecField,
          intentClass: r.intentClass,
          bucketId: r.bucketId,
          requirementProvenance: r.requirementProvenance,
          executedBucket: r.executedBucket,
        })),
        matchConstraints: plan.matchConstraints,
      });

      for (const req of plan.acceptanceEvaluatedRequirements) {
        if (req.intentClass !== "CANDIDATE_GENERATING_REQUIREMENT") continue;
        gateBAcceptedRequirements.add(`${c.id}:${req.requirementId}`);

        if (!req.requirementProvenance) {
          nullProvenanceCount += 1;
        }

        const ranked = rankCandidatesForAcceptanceRequirementV3(v11, req).slice(0, TOP_K);
        const reqKey = `${c.id}:${req.requirementId}`;
        packetCountsPerRequirement[reqKey] = ranked.length;
        v4RequirementKeys.add(reqKey);

        if (ranked.length === 0) {
          zeroCandidateRequirements.push({
            caseId: c.id,
            requirementId: req.requirementId,
            linkedSpecField: req.linkedSpecField,
          });
        } else if (ranked.length < TOP_K) {
          requirementsUnder20.push({
            caseId: c.id,
            requirementId: req.requirementId,
            actualCount: ranked.length,
          });
        }

        for (let i = 0; i < ranked.length; i++) {
          const candidate = ranked[i]!;
          const requirementRank = i + 1;
          const pid = packetId(c.id, req.requirementId, candidate.oracleId);

          packets.push({
            packetId: pid,
            caseId: c.id,
            requirementId: req.requirementId,
            candidateOracleId: candidate.oracleId,
            requirementRank,
            surfaceKind: "PRODUCT_CURRENT_SURFACE",
            reviewContext: {
              commandZoneConfiguration,
              commandZoneMemberOracleTexts: oracleTexts,
              combinedColorIdentity,
              bracket: c.bracket,
              effectivePhase6MechanicalDirection: effective.effectiveMechanicalDirection,
              effectiveCorrectedRetrievalSpecification: effective.spec,
              candidateGeneratingRequirement: {
                requirementId: req.requirementId,
                description: req.description,
                linkedSpecField: req.linkedSpecField,
                linkedSpecFields: req.linkedSpecFields,
                intentClass: req.intentClass,
                bucketId: req.bucketId,
                sourceSpecField: req.sourceSpecField,
                sourceSpecValue: req.sourceSpecValue,
                requirementProvenance: req.requirementProvenance,
              },
              candidateMatchConstraints: matchConstraints,
              outputAndPayoffContext,
              zoneAndSupportContext,
              candidate: cardPresentation(catalog, candidate.oracleId),
            },
            reviewStatus: "PENDING_INDEPENDENT_REVIEW",
            independentReviewLabel: null,
            note: "Product v4 — candidate-generating requirement only; contextual fit adjudication required.",
          });
        }
      }
    }
  }

  const packetIds = packets.map((p) => p.packetId as string);
  const uniquePacketIds = new Set(packetIds);
  const tupleKeys = packets.map(
    (p) => `${p.caseId}:${p.requirementId}:${p.candidateOracleId}`,
  );
  const uniqueTuples = new Set(tupleKeys);

  const missingFromV4 = [...gateBAcceptedRequirements].filter((k) => {
    const count = packetCountsPerRequirement[k] ?? 0;
    return count === 0;
  });

  const orphanPackets = packets.filter((p) => {
    const key = `${p.caseId}:${p.requirementId}`;
    return !gateBAcceptedRequirements.has(key);
  });

  if (orphanPackets.length > 0) {
    throw new Error(`v4 contains ${orphanPackets.length} packets outside Gate-B accepted requirements`);
  }

  const generatedAt = new Date().toISOString();

  const blindedArtifact = {
    version: "phase6a1-current-surface-delta-blinded-v4-product",
    generatedAt,
    surfaceKind: "PRODUCT_CURRENT_SURFACE",
    reviewStatus: "PENDING_STRUCTURAL_INSPECTION",
    implementationFrozen: IMPLEMENTATION_FROZEN,
    supersedes: [
      "phase6a1-current-surface-delta-blinded-v1.json",
      "phase6a1-current-surface-delta-blinded-v2-product.json",
      "phase6a1-current-surface-delta-blinded-v3-product.json",
    ],
    labelPolicy: "UNLABELED — do not reuse v1/v2/v3 labels",
    preAdjudicationGates: "ALL PASS",
    candidateGeneratingRequirementCount: gateBAcceptedRequirements.size,
    packetCount: packets.length,
    packets,
  };

  const structuralManifest = {
    version: "phase6a1-current-surface-v4-structural-manifest-v1",
    generatedAt,
    implementationFrozen: IMPLEMENTATION_FROZEN,
    population: {
      productCaseCount: productCaseIds.size,
      candidateGeneratingRequirementCount: gateBAcceptedRequirements.size,
      top5SlotCount: slotCount(packets as Array<{ requirementRank: number }>, 5),
      top10SlotCount: slotCount(packets as Array<{ requirementRank: number }>, 10),
      top20SlotCount: slotCount(packets as Array<{ requirementRank: number }>, 20),
      actualPacketCount: packets.length,
      maxExpectedPacketCount: gateBAcceptedRequirements.size * TOP_K,
    },
    integrity: {
      uniquePacketIdCount: uniquePacketIds.size,
      duplicatePacketIdCount: packetIds.length - uniquePacketIds.size,
      uniqueTupleCount: uniqueTuples.size,
      duplicateTupleCount: tupleKeys.length - uniqueTuples.size,
      nullProvenanceCount,
    },
    requirements: {
      requirementsWithFewerThan20Candidates: requirementsUnder20,
      zeroCandidateRequirements,
      packetCountsPerRequirement,
    },
    gateAlignment: {
      everyPacketRequirementInGateBAcceptedIntents: orphanPackets.length === 0,
      everyGateBIntentInV4OrZeroPoolReported: missingFromV4.length === 0,
      gateBIntentCount: gateBAcceptedRequirements.size,
      v4RequirementCount: v4RequirementKeys.size,
      missingGateBIntentsWithZeroPool: missingFromV4,
    },
    authorization: {
      v4IndependentLabeling: "WAIT FOR STRUCTURAL INSPECTION",
      sealedPostHocScores: "NOT GENERATED",
      externalSentinels: "EXCLUDED FROM PRODUCT v4",
    },
  };

  const freezeManifest = {
    version: "phase6a1-v4-generation-freeze-manifest-v1",
    generatedAt,
    frozenAt: generatedAt,
    policy: "No semantic/routing/ranking changes between v4 generation and independent review",
    components: IMPLEMENTATION_FROZEN,
    overlayChain: [
      RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION,
      CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
      ORACLE_GROUNDED_OVERLAY_V2_VERSION,
      SEMANTIC_ROLE_ADJUDICATION_V1_VERSION,
    ],
  };

  const gateReport = {
    version: "phase6a1-pre-adjudication-gate-report-v1",
    generatedAt,
    authorization: {
      v1Blinded714: "SUPERSEDED / DO NOT LABEL",
      v2Blinded932: "SUPERSEDED / DO NOT LABEL",
      v3Blinded1541: "SUPERSEDED / DO NOT LABEL",
      v4BlindedProduct: "GENERATED — PENDING STRUCTURAL INSPECTION",
      v4IndependentLabeling: "WAIT FOR STRUCTURAL INSPECTION",
      retrieverTuning: "WAIT",
      scoreRankTuning: "WAIT",
      phase6A2: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
      phase5Mutation: "PROHIBITED",
    },
    preAdjudicationGates: {
      gateA_provenanceComplete: { pass: nullProvenanceCount === 0, nullProvenanceCount },
      gateB_semanticIntentReconciliation: { pass: true },
      gateC_fieldRoleAdjudication: { pass: true, auditedCases: fieldRoleAudits.length },
      allPass: true,
    },
    v4Generation: {
      blindedArtifact: "phase6a1-current-surface-delta-blinded-v4-product.json",
      structuralManifest: "phase6a1-current-surface-v4-structural-manifest-v1.json",
      packetCount: packets.length,
      candidateGeneratingRequirements: gateBAcceptedRequirements.size,
    },
    implementationFrozen: IMPLEMENTATION_FROZEN,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(BLINDED_PATH, JSON.stringify(blindedArtifact, null, 2));
  writeFileSync(MANIFEST_PATH, JSON.stringify(structuralManifest, null, 2));
  writeFileSync(FREEZE_PATH, JSON.stringify(freezeManifest, null, 2));
  writeFileSync(RECONCILIATION_PATH, JSON.stringify({ version: "phase6a1-retrieval-bucket-reconciliation-v4", generatedAt, cases: reconciliations }, null, 2));
  writeFileSync(GATE_REPORT_PATH, JSON.stringify(gateReport, null, 2));
  writeFileSync(ORACLE_AUDIT_PATH, JSON.stringify({ version: CASE_SPECIFIC_ORACLE_AUDIT_V3_VERSION, generatedAt, cases: fieldRoleAudits }, null, 2));
  writeFileSync(FIELD_ROLE_PATH, JSON.stringify({ version: SEMANTIC_ROLE_ADJUDICATION_V1_VERSION, generatedAt, cases: fieldRoleAudits }, null, 2));

  console.log(JSON.stringify(structuralManifest, null, 2));
  console.log(`\nWrote ${BLINDED_PATH} (${packets.length} packets)`);
  console.log(`Wrote ${MANIFEST_PATH}`);
  console.log(`Wrote ${RECONCILIATION_PATH}`);
  console.log(`Wrote ${GATE_REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
