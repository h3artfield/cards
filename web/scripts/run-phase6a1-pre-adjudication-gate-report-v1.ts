#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Pre-adjudication gate report (strict Gates A/B/C).
 * Validates overlay chain + semantic acceptance + Oracle audit.
 * Does NOT generate blinded v4 candidate corpus.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  summarizeGateCAuditsV3,
} from "./lib/phase6a1-case-specific-oracle-audit-v3";
import { CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION } from "./lib/phase6a1-contamination-correction-overlay-v1";
import { resolveEffectiveSpec, EFFECTIVE_SPEC_RESOLVER_V1_VERSION } from "./lib/phase6a1-effective-spec-resolver-v1";
import { ORACLE_GROUNDED_OVERLAY_V2_VERSION } from "./lib/phase6a1-oracle-grounded-overlay-v2";
import {
  buildSentinelRequirements,
  REQUIREMENT_PROVENANCE_V1_VERSION,
} from "./lib/phase6a1-requirement-provenance-v1";
import {
  buildProductAcceptanceRequirementsV3,
  RETRIEVAL_ACCEPTANCE_PLAN_V3_VERSION,
} from "./lib/phase6a1-retrieval-acceptance-plan-v3";
import { SEMANTIC_ROLE_ADJUDICATION_V1_VERSION } from "./lib/phase6a1-semantic-role-correction-overlay-v1";
import { UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import {
  getOverlayForCaseV131,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
} from "./lib/phase6a1-spec-correction-overlay-v1.3.1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-pre-adjudication-gate-report-v1.json");
const RECONCILIATION_PATH = resolve(OUT_DIR, "phase6a1-retrieval-bucket-reconciliation-v4-pending.json");
const ORACLE_AUDIT_PATH = resolve(OUT_DIR, "phase6a1-effective-spec-oracle-audit-v3.json");
const FIELD_ROLE_AUDIT_PATH = resolve(OUT_DIR, "phase6a1-field-role-adjudication-v1.json");

const SUPERSEDED = {
  v1: "phase6a1-current-surface-delta-blinded-v1.json",
  v2: "phase6a1-current-surface-delta-blinded-v2-product.json",
  v3: "phase6a1-current-surface-delta-blinded-v3-product.json",
};

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

  const gateA: string[] = [];
  const gateB: string[] = [];
  const gateC: string[] = [];

  const reconciliations: Array<Record<string, unknown>> = [];
  const fieldRoleAudits: Array<Record<string, unknown>> = [];

  let totalAcceptancePairs = 0;
  let casesProcessed = 0;

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

      casesProcessed += 1;
      const frozenSpec = primary.retrievalSpecification;
      const oracleTexts = resolution.oracleIds.map((id) => ({
        name: catalog.byOracleId.get(id)?.canonicalName ?? id,
        oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
      }));

      const effective = resolveEffectiveSpec({
        caseId: c.id,
        frozenSpec,
        frozenDirection: primary.mechanicalDescription,
        oracleTexts,
        p11Entry: getOverlayForCaseV131(c.id),
      });

      const oracleBlob = oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase();

      const oracleAudit = auditCaseFieldRoleGateC({
        caseId: c.id,
        effectiveSpec: effective.spec,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        oracleTexts,
        preCorrectionSpec: effective.preSemanticRoleSpec,
      });

      fieldRoleAudits.push({
        caseId: c.id,
        commanders: c.commanders,
        gateCPass: oracleAudit.gateCPass,
        gateCFailures: oracleAudit.gateCFailures,
        semanticRoleMismatchCount: oracleAudit.semanticRoleMismatchCount,
        fieldRoleReports: oracleAudit.fieldRoleReports.map((r) => ({
          originalField: r.originalField,
          originalValue: r.originalValue,
          mechanicalVerdict: r.mechanicalVerdict,
          semanticRole: r.semanticRole,
          disposition: r.disposition,
          effectiveField: r.effectiveFieldResolved,
          effectiveValue: r.effectiveValueResolved,
          intentClass: r.intentClass,
          rolePlacementCorrect: r.rolePlacementCorrect,
          causalDefense: r.causalDefense,
        })),
        overlayChain: effective.overlayChain,
      });

      if (!oracleAudit.gateCPass) {
        gateC.push(`${c.id}: ${oracleAudit.gateCFailures.join("; ")}`);
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

      totalAcceptancePairs += plan.acceptanceEvaluatedRequirements.length;

      if (!plan.reconciliationPass) {
        const parts = [
          ...plan.bucketInvariantFailures.map((f) => `bucket:${f}`),
          ...plan.uncoveredCandidateGeneratingIntents.map((f) => `uncovered:${f}`),
        ];
        gateB.push(`${c.id}: ${parts.join("; ")}`);
      }

      for (const req of plan.acceptanceEvaluatedRequirements) {
        if (!req.requirementProvenance) gateA.push(`${c.id}/${req.requirementId}: null provenance`);
      }

      reconciliations.push({
        caseId: c.id,
        commanders: c.commanders,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        overlayChain: effective.overlayChain,
        effectiveSemanticIntentCount: plan.effectiveSemanticIntents.length,
        candidateGeneratingIntentCount: plan.candidateGeneratingIntents.length,
        matchConstraintCount: plan.matchConstraints.length,
        contextIntentCount: plan.contextIntents.length,
        executedRetrievalBuckets: plan.executedRetrievalBuckets,
        acceptanceEvaluatedFieldCount: plan.acceptanceEvaluatedRequirements.length,
        uncoveredCandidateGeneratingIntents: plan.uncoveredCandidateGeneratingIntents,
        bucketInvariantFailures: plan.bucketInvariantFailures,
        reconciliationPass: plan.reconciliationPass,
        acceptanceRequirements: plan.acceptanceEvaluatedRequirements.map((r) => ({
          requirementId: r.requirementId,
          linkedSpecField: r.linkedSpecField,
          intentClass: r.intentClass,
          bucketId: r.bucketId,
          requirementProvenance: r.requirementProvenance,
          executedBucket: r.executedBucket,
          bucketInvariantPass: r.bucketInvariantPass,
        })),
        matchConstraints: plan.matchConstraints,
        sentinelRequirementCount: buildSentinelRequirements(c.id).length,
      });
    }
  }

  const gateCSummary = summarizeGateCAuditsV3(
    fieldRoleAudits.map(
      (o) =>
        ({
          caseId: o.caseId as string,
          auditMethod: "CASE_SPECIFIC_FIELD_ROLE_V3" as const,
          directionAudit: {
            effectiveDirection: "",
            mechanicalVerdict: "DIRECT_ORACLE_MECHANIC" as const,
            semanticRole: "CONTEXT_ONLY" as const,
            explicitlyAudited: true,
            causalDefense: "",
            oracleEvidence: "",
          },
          fieldRoleReports: [],
          gateCPass: o.gateCPass as boolean,
          gateCFailures: o.gateCFailures as string[],
          semanticRoleMismatchCount: o.semanticRoleMismatchCount as number,
          unsupportedActiveFieldCount: 0,
        }),
    ),
  );

  const gatesPass = gateA.length === 0 && gateB.length === 0 && gateC.length === 0;

  const report = {
    version: "phase6a1-pre-adjudication-gate-report-v1",
    generatedAt: new Date().toISOString(),
    authorization: {
      v1Blinded714: "SUPERSEDED / DO NOT LABEL",
      v2Blinded932: "SUPERSEDED / DO NOT LABEL",
      v3Blinded1541: "FAIL / DO NOT LABEL",
      v3StructuralBlinding: "PASS",
      v3SemanticAcceptanceInput: "FAIL",
      v3IndependentLabeling: "DO NOT START",
      preAdjudicationGates: gatesPass ? "ALL PASS — v4 blinded generation authorized" : "FAIL — DO NOT GENERATE v4 BLINDED CORPUS",
      independentLabeling: gatesPass ? "WAIT — generate v4 blinded artifact first" : "BLOCKED",
      retrieverTuning: "WAIT",
      phase6A2: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
      phase5Mutation: "PROHIBITED",
    },
    supersededArtifacts: {
      [SUPERSEDED.v1]: { status: "SUPERSEDED_PRE_ADJUDICATION", packetCount: 714 },
      [SUPERSEDED.v2]: { status: "SUPERSEDED_PRE_ADJUDICATION", packetCount: 932 },
      [SUPERSEDED.v3]: {
        status: "FAIL_DO_NOT_LABEL",
        packetCount: 1541,
        reason: "Gate B bucket reconciliation invalid; Gate C generic auto-certification invalid.",
      },
    },
    preAdjudicationGates: {
      gateA_provenanceComplete: { pass: gateA.length === 0, failureCount: gateA.length, failures: gateA.slice(0, 50) },
      gateB_semanticIntentReconciliation: {
        pass: gateB.length === 0,
        failureCount: gateB.length,
        failures: gateB.slice(0, 50),
      },
      gateC_fieldRoleAdjudication: {
        pass: gateC.length === 0,
        failureCount: gateC.length,
        failures: gateC.slice(0, 50),
        ...gateCSummary,
      },
      allPass: gatesPass,
    },
    overlayChain: [
      RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION,
      CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
      ORACLE_GROUNDED_OVERLAY_V2_VERSION,
      SEMANTIC_ROLE_ADJUDICATION_V1_VERSION,
    ],
    implementationFrozen: {
      effectiveSpecResolver: EFFECTIVE_SPEC_RESOLVER_V1_VERSION,
      functionalMatch: FUNCTIONAL_MATCH_V1_VERSION,
      retrieval: SEMANTIC_CANDIDATE_RETRIEVAL_V1_1_VERSION,
      acceptancePlan: RETRIEVAL_ACCEPTANCE_PLAN_V3_VERSION,
      oracleAudit: CASE_SPECIFIC_ORACLE_AUDIT_V3_VERSION,
      semanticRoleAdjudication: SEMANTIC_ROLE_ADJUDICATION_V1_VERSION,
      provenanceAudit: REQUIREMENT_PROVENANCE_V1_VERSION,
    },
    populationSummary: {
      reviewCasesProcessed: casesProcessed,
      acceptanceRequirementPairs: totalAcceptancePairs,
      projectedV4PacketEstimate: gatesPass ? totalAcceptancePairs * 20 : null,
    },
    nextSteps: gatesPass
      ? ["Generate phase6a1-current-surface-delta-blinded-v4-product.json"]
      : [
          "Repair failing Gate B bucket/acceptance cases",
          "Complete case-specific Oracle audit defenses for failing Gate C cases",
          "Re-run this gate report until allPass",
          "Do NOT generate blinded v4 corpus until gates pass",
        ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  writeFileSync(RECONCILIATION_PATH, JSON.stringify({ version: "phase6a1-retrieval-bucket-reconciliation-v4-pending", generatedAt: report.generatedAt, cases: reconciliations }, null, 2));
  writeFileSync(ORACLE_AUDIT_PATH, JSON.stringify({ version: CASE_SPECIFIC_ORACLE_AUDIT_V3_VERSION, generatedAt: report.generatedAt, cases: fieldRoleAudits }, null, 2));
  writeFileSync(FIELD_ROLE_AUDIT_PATH, JSON.stringify({ version: SEMANTIC_ROLE_ADJUDICATION_V1_VERSION, generatedAt: report.generatedAt, cases: fieldRoleAudits }, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${REPORT_PATH}`);
  if (!gatesPass) {
    console.error("\nGATES FAIL — DO NOT GENERATE v4 BLINDED CORPUS");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
