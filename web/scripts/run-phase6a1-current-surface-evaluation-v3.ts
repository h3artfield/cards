#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Product current-surface evaluation v3.
 * Bucket-reconciled acceptance plan + full Oracle audit gates.
 * REPORT AND WAIT.
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
import type { IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";
import { bestMatchForGoldRequirement, functionStratum } from "./lib/phase6a1-p14-metrics-v1";
import {
  CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
  getFullyEffectiveSpec,
  getOverlayForCaseV131,
} from "./lib/phase6a1-contamination-correction-overlay-v1";
import {
  auditEffectiveSpecUniversal,
  EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION,
} from "./lib/phase6a1-effective-spec-oracle-audit-v1";
import {
  auditAllRequirementPairs,
  buildSentinelRequirements,
  REQUIREMENT_PROVENANCE_V1_VERSION,
} from "./lib/phase6a1-requirement-provenance-v1";
import {
  buildProductAcceptanceRequirements,
  rankCandidatesForAcceptanceRequirement,
  RETRIEVAL_ACCEPTANCE_PLAN_V1_VERSION,
  type ProductAcceptanceRequirement,
  type RetrievalPlanReconciliation,
} from "./lib/phase6a1-retrieval-acceptance-plan-v1";
import { UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import { RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION } from "./lib/phase6a1-spec-correction-overlay-v1.3.1";
import {
  buildSealedPostHoc,
  cardPresentation,
  type CurrentSurfaceTuple,
  inferSemanticFamily,
  loadFrozenLabelMaps,
  packetId,
  resolveLabel,
  STRONG_VALID_LABELS,
} from "./lib/phase6a1-current-surface-v1";

loadProjectEnvLocal();

const FROZEN_271_PATH = resolve("data/milestones/deck-synthesis/phase6a-development-adjudication-frozen-v1.json");
const FROZEN_240_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-adjudication-frozen-v1.json");
const OUT_DIR = resolve("data/milestones/deck-synthesis");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-evaluation-report-v3.json");
const COVERAGE_PATH = resolve(OUT_DIR, "phase6a1-current-surface-coverage-v3.json");
const SNAPSHOT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-snapshot-v3.json");
const RECONCILIATION_PATH = resolve(OUT_DIR, "phase6a1-retrieval-bucket-reconciliation-v3.json");
const BLINDED_PRODUCT_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v3-product.json");
const BLINDED_SENTINEL_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v3-sentinel.json");
const SEALED_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-post-hoc-sealed-v3.json");
const FAILURE_PATH = resolve(OUT_DIR, "phase6a1-current-surface-failure-diagnostics-v3.json");

const SUPERSEDED_V1 = "phase6a1-current-surface-delta-blinded-v1.json";
const SUPERSEDED_V2 = "phase6a1-current-surface-delta-blinded-v2-product.json";

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

function frozenScalarFields(spec: { requiredFunctions: string[]; requiredInputs: string[] }): Set<string> {
  const out = new Set<string>();
  for (const fn of spec.requiredFunctions) out.add(`requiredFunctions:${fn}`);
  for (const input of spec.requiredInputs) out.add(`requiredInputs:${input}`);
  return out;
}

function slotCoverage(tuples: CurrentSurfaceTuple[], k: number) {
  const slots = tuples.filter((t) => t.requirementRank <= k);
  const labeled271 = slots.filter((t) => t.labelSource === "FROZEN_271").length;
  const labeled240 = slots.filter((t) => t.labelSource === "FROZEN_240").length;
  const unlabeled = slots.filter((t) => t.labelSource === "UNLABELED").length;
  return {
    totalSlots: slots.length,
    labeled271,
    labeled240,
    unlabeled,
    labelCoverageRate: slots.length ? (labeled271 + labeled240) / slots.length : 0,
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

  const productTuples: CurrentSurfaceTuple[] = [];
  const sentinelTuples: CurrentSurfaceTuple[] = [];
  const productSnapshots: Array<Record<string, unknown>> = [];
  const reconciliations: Array<Record<string, unknown>> = [];
  const oracleAuditSummaries: Array<Record<string, unknown>> = [];
  const productBlinded: Array<Record<string, unknown>> = [];
  const sentinelBlinded: Array<Record<string, unknown>> = [];
  const sealedPostHoc: Array<Record<string, unknown>> = [];

  const gateA: string[] = [];
  const gateB: string[] = [];
  const gateC: string[] = [];

  let totalAcceptancePairs = 0;

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
      const effective = getFullyEffectiveSpec(
        c.id,
        frozenSpec,
        primary.mechanicalDescription,
        getOverlayForCaseV131(c.id),
        oracleTexts,
      );

      const oracleAudit = auditEffectiveSpecUniversal({
        caseId: c.id,
        effectiveSpec: effective.spec,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        oracleTexts,
      });

      oracleAuditSummaries.push({
        caseId: c.id,
        caseClassification: oracleAudit.caseClassification,
        remainingIssueCount: oracleAudit.remainingIssues.length,
        contaminationTemplates: oracleAudit.contaminationTemplates.map((t) => t.templateId),
        overlayApplied: {
          upstreamGap: effective.upstreamGapApplied,
          contamination: effective.contaminationCorrectionApplied,
          p11: Boolean(getOverlayForCaseV131(c.id)),
        },
      });

      if (oracleAudit.caseClassification !== "CONFIRMED_CORRECTED_SPEC") {
        gateC.push(`${c.id}: ${oracleAudit.caseClassification} (${oracleAudit.remainingIssues.length} issues)`);
      }

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

      const plan = buildProductAcceptanceRequirements({
        caseId: c.id,
        frozenSpec,
        effectiveSpec: effective.spec,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        v11Report: v11,
        upstreamGapApplied: effective.upstreamGapApplied,
        contaminationCorrectionApplied: effective.contaminationCorrectionApplied,
      });

      if (!plan.reconciliationPass) {
        gateB.push(`${c.id}: omitted=${plan.omittedFromAcceptance.join(",")}`);
      }

      for (const req of plan.acceptanceEvaluatedRequirements) {
        if (!req.requirementProvenance) gateA.push(`${c.id}/${req.requirementId}: null provenance`);
      }

      totalAcceptancePairs += plan.acceptanceEvaluatedRequirements.length;
      const frozenFields = frozenScalarFields(frozenSpec);

      reconciliations.push({
        caseId: c.id,
        commanders: c.commanders,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        effectiveRetrievalDrivingFields: plan.effectiveRetrievalDrivingFields,
        executedRetrievalBuckets: plan.executedRetrievalBuckets,
        acceptanceEvaluatedFieldCount: plan.acceptanceEvaluatedRequirements.length,
        nonBucketContextFieldCount: plan.nonBucketContextFields.length,
        reconciliationPass: plan.reconciliationPass,
        acceptanceRequirements: plan.acceptanceEvaluatedRequirements.map((r) => ({
          requirementId: r.requirementId,
          linkedSpecField: r.linkedSpecField,
          bucketId: r.bucketId,
          requirementProvenance: r.requirementProvenance,
          executedBucket: r.executedBucket,
        })),
        nonBucketContextFields: plan.nonBucketContextFields,
      });

      const reqRows: Array<Record<string, unknown>> = [];
      for (const req of plan.acceptanceEvaluatedRequirements) {
        const ranked = rankCandidatesForAcceptanceRequirement(v11, req).slice(0, 20);
        const reqChanged = !frozenFields.has(req.linkedSpecField);
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
          productTuples.push(tuple);

          if (label.labelSource === "UNLABELED") {
            productBlinded.push({
              packetId: tuple.tupleId,
              caseId: c.id,
              requirementId: req.requirementId,
              candidateOracleId: candidate.oracleId,
              surfaceKind: "PRODUCT_CURRENT_SURFACE",
              reviewContext: {
                commandZoneConfiguration,
                commandZoneMemberOracleTexts: oracleTexts,
                combinedColorIdentity,
                bracket: c.bracket,
                effectivePhase6MechanicalDirection: effective.effectiveMechanicalDirection,
                effectiveCorrectedRetrievalSpecification: effective.spec,
                requirementProvenance: req.requirementProvenance,
                bucketId: req.bucketId,
                sourceSpecField: req.sourceSpecField,
                sourceSpecValue: req.sourceSpecValue,
                executedBucket: req.executedBucket,
                requirement: {
                  requirementId: req.requirementId,
                  description: req.description,
                  linkedSpecFields: req.linkedSpecFields,
                  linkedSpecField: req.linkedSpecField,
                  materiallyChangedFromFrozenPhase5: reqChanged,
                  provenanceClassification: req.requirementProvenance,
                  bucketId: req.bucketId,
                },
                candidate: cardPresentation(catalog, candidate.oracleId),
              },
              reviewStatus: "PENDING_INDEPENDENT_REVIEW",
              note: "Product v3 — bucket-reconciled acceptance requirement from effective retrieval plan.",
            });
            sealedPostHoc.push(buildSealedPostHoc({ tuple, candidate, functionalMatch: match }));
          }
        }

        reqRows.push({
          caseId: c.id,
          requirementId: req.requirementId,
          linkedSpecField: req.linkedSpecField,
          bucketId: req.bucketId,
          requirementProvenance: req.requirementProvenance,
          executedBucket: req.executedBucket,
          materiallyChangedFromFrozenPhase5: reqChanged,
          top20OracleIds: ranked.map((x) => x.oracleId),
          tupleLabelSources: reqTuples.map((t) => ({
            rank: t.requirementRank,
            oracleId: t.candidateOracleId,
            labelSource: t.labelSource,
          })),
        });
      }

      productSnapshots.push({
        caseId: c.id,
        commanders: c.commanders,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        effectiveRetrievalSpecification: effective.spec,
        requirements: reqRows,
      });

      const provenanceRecords = auditAllRequirementPairs({
        caseId: c.id,
        frozenSpec,
        fullyEffectiveSpec: effective.spec,
      });
      const sentinelRequirements = buildSentinelRequirements(c.id).filter((req) => {
        const prov = provenanceRecords.find((r) => r.requirementId === req.requirementId);
        return prov?.evaluateOnSentinelSurface ?? false;
      });

      for (const req of sentinelRequirements) {
        const ranked = rankCandidatesForAcceptanceRequirement(v11, {
          ...req,
          caseId: c.id,
          bucketId: "NON_BUCKET_CONTEXT",
          sourceSpecField: "requiredFunctions",
          sourceSpecValue: req.linkedSpecFields[0]?.split(":")[1] ?? req.requirementId,
          requirementProvenance: "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT",
          linkedSpecField: req.linkedSpecFields[0] ?? `requiredFunctions:${req.requirementId}`,
          executedBucket: false,
        } as ProductAcceptanceRequirement).slice(0, 20);

        for (let i = 0; i < ranked.length; i++) {
          const candidate = ranked[i]!;
          sentinelTuples.push({
            tupleId: packetId(c.id, req.requirementId, candidate.oracleId),
            caseId: c.id,
            requirementId: req.requirementId,
            candidateOracleId: candidate.oracleId,
            requirementRank: i + 1,
            labelSource: "UNLABELED",
            humanLabel: null,
            requirementMateriallyChanged: true,
            linkedSpecFields: req.linkedSpecFields,
            functionStratum: functionStratum(req.requirementId, req.linkedSpecFields),
            semanticFamily: inferSemanticFamily(req.requirementId, req.linkedSpecFields, null),
          });
          sentinelBlinded.push({
            packetId: packetId(c.id, req.requirementId, candidate.oracleId),
            caseId: c.id,
            requirementId: req.requirementId,
            candidateOracleId: candidate.oracleId,
            surfaceKind: "EXTERNAL_SENTINEL_SURFACE",
            reviewStatus: "DIAGNOSTIC_OPTIONAL",
          });
        }
      }
    }
  }

  const gatesPass = gateA.length === 0 && gateB.length === 0 && gateC.length === 0;

  const productCoverage = {
    version: "phase6a1-current-surface-coverage-v3-product",
    generatedAt: new Date().toISOString(),
    surfaceKind: "PRODUCT_CURRENT_SURFACE",
    activeCaseRequirementPairs: totalAcceptancePairs,
    top5: slotCoverage(productTuples, 5),
    top10: slotCoverage(productTuples, 10),
    top20: slotCoverage(productTuples, 20),
    allCurrentTop20Tuples: {
      total: productTuples.length,
      labeled271: productTuples.filter((t) => t.labelSource === "FROZEN_271").length,
      labeled240: productTuples.filter((t) => t.labelSource === "FROZEN_240").length,
      unlabeled: productTuples.filter((t) => t.labelSource === "UNLABELED").length,
    },
    unlabeledDeltaPacketCount: productBlinded.length,
  };

  const report = {
    version: "phase6a1-current-surface-evaluation-report-v3",
    generatedAt: new Date().toISOString(),
    authorization: {
      v1Blinded714: "SUPERSEDED / DO NOT LABEL",
      v2Blinded932: "SUPERSEDED / DO NOT LABEL",
      preAdjudicationGates: gatesPass ? "ALL PASS" : "FAIL — DO NOT BEGIN INDEPENDENT LABELING",
      independentLabeling: gatesPass ? "WAIT — structural inspection of v3 blinded artifact required" : "BLOCKED",
      retrieverTuning: "WAIT",
      phase6A2: "WAIT",
      phase6AFreeze: "WAIT",
    },
    supersededArtifacts: {
      [SUPERSEDED_V1]: { status: "SUPERSEDED_PRE_ADJUDICATION", packetCount: 714 },
      [SUPERSEDED_V2]: {
        status: "SUPERSEDED_PRE_ADJUDICATION",
        packetCount: 932,
        reason: "Incomplete product coverage + missing provenance on derived pairs + residual spec contamination.",
      },
    },
    preAdjudicationGates: {
      gateA_allProductRequirementsHaveProvenance: { pass: gateA.length === 0, failures: gateA },
      gateB_bucketReconciliation: { pass: gateB.length === 0, failures: gateB },
      gateC_effectiveSpecOracleAudit: { pass: gateC.length === 0, failures: gateC },
      allPass: gatesPass,
    },
    overlayChain: [
      RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION,
      CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
    ],
    implementationFrozen: {
      functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
      retrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
      acceptancePlan: RETRIEVAL_ACCEPTANCE_PLAN_V1_VERSION,
      oracleAudit: EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION,
    },
    surfaces: {
      PRODUCT_CURRENT_SURFACE: {
        acceptanceRequirementPairs: totalAcceptancePairs,
        tupleCount: productTuples.length,
        unlabeledDeltaPackets: productBlinded.length,
        blindedDelta: gatesPass ? BLINDED_PRODUCT_PATH : null,
      },
      EXTERNAL_SENTINEL_SURFACE: {
        tupleCount: sentinelTuples.length,
        unlabeledDeltaPackets: sentinelBlinded.length,
      },
    },
    productCoverage,
    oracleAuditSummaries,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  writeFileSync(COVERAGE_PATH, JSON.stringify(productCoverage, null, 2));
  writeFileSync(RECONCILIATION_PATH, JSON.stringify({ version: RETRIEVAL_ACCEPTANCE_PLAN_V1_VERSION, reconciliations }, null, 2));
  writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-snapshot-v3",
        tupleCount: productTuples.length,
        acceptanceRequirementPairs: totalAcceptancePairs,
        requirementSnapshots: productSnapshots,
        tuples: productTuples,
      },
      null,
      2,
    ),
  );

  if (gatesPass) {
    writeFileSync(
      BLINDED_PRODUCT_PATH,
      JSON.stringify(
        {
          version: "phase6a1-current-surface-delta-blinded-v3-product",
          surfaceKind: "PRODUCT_CURRENT_SURFACE",
          reviewStatus: "PENDING_INDEPENDENT_REVIEW",
          supersedes: [SUPERSEDED_V1, SUPERSEDED_V2],
          packetCount: productBlinded.length,
          preAdjudicationGates: "ALL PASS",
          packets: productBlinded,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      SEALED_PATH,
      JSON.stringify(
        {
          version: "phase6a1-current-surface-delta-post-hoc-sealed-v3",
          recordCount: sealedPostHoc.length,
          recordsByPacketId: Object.fromEntries(sealedPostHoc.map((r) => [(r as { packetId: string }).packetId, r])),
        },
        null,
        2,
      ),
    );
  } else {
    writeFileSync(
      BLINDED_PRODUCT_PATH,
      JSON.stringify(
        {
          version: "phase6a1-current-surface-delta-blinded-v3-product",
          status: "NOT_GENERATED_GATES_FAILED",
          supersedes: [SUPERSEDED_V1, SUPERSEDED_V2],
          preAdjudicationGates: report.preAdjudicationGates,
          note: "Blinded candidate packets withheld until gates A/B/C pass.",
        },
        null,
        2,
      ),
    );
  }

  writeFileSync(
    BLINDED_SENTINEL_PATH,
    JSON.stringify(
      {
        version: "phase6a1-current-surface-delta-blinded-v3-sentinel",
        surfaceKind: "EXTERNAL_SENTINEL_SURFACE",
        packetCount: sentinelBlinded.length,
        packets: sentinelBlinded,
      },
      null,
      2,
    ),
  );
  writeFileSync(FAILURE_PATH, JSON.stringify({ version: "phase6a1-current-surface-failure-diagnostics-v3", scope: "gates-only", gates: report.preAdjudicationGates }, null, 2));

  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Acceptance pairs: ${totalAcceptancePairs} tuples: ${productTuples.length}`);
  console.log(`Gates A/B/C: ${gateA.length}/${gateB.length}/${gateC.length} failures — allPass=${gatesPass}`);
  if (gatesPass) console.log(`Blinded v3 product packets: ${productBlinded.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
