#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — CandidateIntent catalog + causal audit (28-case population).
 * Does NOT generate blinded corpus. REPORT AND WAIT.
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
} from "../src/lib/deck-synthesis";
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import {
  CANDIDATE_INTENT_ADJUDICATION_V1_VERSION,
  getAllCandidateIntentProfiles,
} from "./lib/phase6a1-candidate-intent-adjudication-v1";
import { CANDIDATE_INTENT_TYPES_V1_VERSION } from "./lib/phase6a1-candidate-intent-types-v1";
import {
  auditCaseCandidateIntentGateC,
  CASE_SPECIFIC_ORACLE_AUDIT_V4_VERSION,
  summarizeCandidateIntentGateC,
} from "./lib/phase6a1-case-specific-oracle-audit-v4";
import { resolveEffectiveSpec } from "./lib/phase6a1-effective-spec-resolver-v1";
import {
  buildCandidateIntentAcceptanceV4,
  RETRIEVAL_ACCEPTANCE_PLAN_V4_VERSION,
} from "./lib/phase6a1-retrieval-acceptance-plan-v4";
import { getOverlayForCaseV131 } from "./lib/phase6a1-spec-correction-overlay-v1.3.1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const CATALOG_PATH = resolve(OUT_DIR, "phase6a1-candidate-intent-catalog-v1.json");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-candidate-intent-audit-v1.json");
const RECONCILIATION_PATH = resolve(OUT_DIR, "phase6a1-candidate-intent-reconciliation-v1.json");
const V4_MANIFEST_PATH = resolve(OUT_DIR, "phase6a1-current-surface-v4-structural-manifest-v1.json");

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

type V4Req = { caseId: string; requirementId: string; linkedSpecField: string; sourceSpecField: string };

function loadV4Requirements(): V4Req[] {
  if (!existsSync(V4_MANIFEST_PATH)) return [];
  const manifest = JSON.parse(readFileSync(V4_MANIFEST_PATH, "utf8")) as {
    requirements?: { packetCountsPerRequirement?: Record<string, number> };
  };
  const counts = manifest.requirements?.packetCountsPerRequirement ?? {};
  return Object.keys(counts).map((key) => {
    const [caseId, requirementId] = key.split(":");
    const token = requirementId.replace(/^requiredFunctions_/, "");
    return {
      caseId,
      requirementId,
      linkedSpecField: requirementId.replace(/_/g, ":").replace("requiredFunctions:", "requiredFunctions:"),
      sourceSpecField: "requiredFunctions",
    };
  });
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const reviewCaseIds = new Set(getCalibrationCaseIds());
  const profiles = getAllCandidateIntentProfiles();

  const gateBFailures: string[] = [];
  const gateCFailures: string[] = [];
  const reconciliations: Array<Record<string, unknown>> = [];
  const gateCAudits: Array<Record<string, unknown>> = [];

  let totalCoreIntents = 0;
  let totalProjectedPackets = 0;

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

      const gateC = auditCaseCandidateIntentGateC({
        caseId: c.id,
        effectiveSpec: effective.spec,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        oracleTexts,
        preCorrectionSpec: effective.preSemanticRoleSpec,
      });

      if (!gateC.gateCPass) gateCFailures.push(`${c.id}: ${gateC.gateCFailures.join("; ")}`);
      gateCAudits.push({
        caseId: c.id,
        commanders: c.commanders,
        gateCPass: gateC.gateCPass,
        gateCFailures: gateC.gateCFailures,
        coreIntentAudits: gateC.coreIntentAudits,
        noCoreDeclaration: gateC.noCoreDeclaration,
      });

      const plan = buildCandidateIntentAcceptanceV4({
        caseId: c.id,
        frozenSpec,
        effectiveSpec: effective.spec,
        v11Report: v11,
        upstreamGapApplied: effective.upstreamGapApplied,
        contaminationCorrectionApplied: effective.contaminationCorrectionApplied,
      });

      totalCoreIntents += plan.coreIntentCount;
      totalProjectedPackets += plan.acceptanceEvaluatedRequirements.length * 20;

      if (!plan.reconciliationPass) {
        gateBFailures.push(
          `${c.id}: ${[...plan.bucketInvariantFailures, ...plan.uncoveredCoreIntents.map((i) => `uncovered:${i}`)].join("; ")}`,
        );
      }

      reconciliations.push({
        caseId: c.id,
        commanders: c.commanders,
        effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
        coreIntentCount: plan.coreIntentCount,
        noCoreDeclaration: plan.noCoreDeclaration,
        noCoreJustification: plan.noCoreJustification,
        acceptanceRequirements: plan.acceptanceEvaluatedRequirements.map((r) => ({
          intentId: r.intentId,
          requirementId: r.requirementId,
          linkedSpecField: r.linkedSpecField,
          sourceSpecField: r.sourceSpecField,
          causalRole: r.causalRole,
          bucketId: r.bucketId,
          executedBucket: r.executedBucket,
          bridge: r.bridge,
        })),
        reconciliationPass: plan.reconciliationPass,
        bucketInvariantFailures: plan.bucketInvariantFailures,
        uncoveredCoreIntents: plan.uncoveredCoreIntents,
      });
    }
  }

  const v4Reqs = loadV4Requirements();
  const v4ByCase = new Map<string, V4Req[]>();
  for (const r of v4Reqs) {
    if (!v4ByCase.has(r.caseId)) v4ByCase.set(r.caseId, []);
    v4ByCase.get(r.caseId)!.push(r);
  }

  const v4bCaseIds = new Set(v4ByCase.keys());
  const intentCaseIds = new Set(profiles.map((p) => p.caseId));
  const missingFromV4b = [...intentCaseIds].filter((id) => !v4bCaseIds.has(id) && !profiles.find((p) => p.caseId === id)?.noCoreDeclaration);
  const noCoreCases = profiles.filter((p) => p.noCoreDeclaration).map((p) => p.caseId);
  const coreCases = profiles.filter((p) => p.coreIntents.length > 0);

  const v4FieldNameOnlyCount = v4Reqs.filter((r) => r.sourceSpecField === "requiredFunctions").length;
  const v4RequiredFunctionsOnly = v4FieldNameOnlyCount === v4Reqs.length && v4Reqs.length > 0;

  const knownFailures = {
    curieTokenGeneration: v4ByCase.get("blindv5-22-broad-composite")?.some((r) => r.requirementId.includes("token_generation")) ?? false,
    orvarTokenGeneration: v4ByCase.get("blindv5-51-tokens")?.some((r) => r.requirementId.includes("token_generation")) ?? false,
    kinnanLibraryTop: v4ByCase.get("hybrid-kinnan")?.some((r) => r.requirementId.includes("creature_from_library_top")) ?? false,
    earthKingLandRamp: v4ByCase.get("blindv5-59-tutor-toolbox")?.some((r) => r.requirementId.includes("land_ramp")) ?? false,
    merenRecursion: v4ByCase.get("single-graveyard-meren")?.some((r) => r.requirementId.includes("recursion")) ?? false,
  };

  const gateCSummary = summarizeCandidateIntentGateC(
    gateCAudits.map(
      (g) =>
        ({
          caseId: g.caseId as string,
          fieldRoleAudit: { gateCPass: g.gateCPass as boolean, gateCFailures: g.gateCFailures as string[] },
          coreIntentAudits: g.coreIntentAudits as [],
          noCoreDeclaration: g.noCoreDeclaration as undefined,
          gateCPass: g.gateCPass as boolean,
          gateCFailures: g.gateCFailures as string[],
        }) as Parameters<typeof summarizeCandidateIntentGateC>[0][number],
    ),
  );

  const gateBPass = gateBFailures.length === 0;
  const gateCPass = gateCFailures.length === 0;
  const populationCoveragePass =
    profiles.length === 28 &&
    profiles.every((p) => p.coreIntents.length > 0 || p.noCoreDeclaration);

  const generatedAt = new Date().toISOString();

  const catalogArtifact = {
    version: CANDIDATE_INTENT_TYPES_V1_VERSION,
    adjudicationVersion: CANDIDATE_INTENT_ADJUDICATION_V1_VERSION,
    generatedAt,
    populationCaseCount: profiles.length,
    coreIntentCount: profiles.reduce((n, p) => n + p.coreIntents.length, 0),
    noCoreCaseCount: noCoreCases.length,
    profiles,
  };

  const audit = {
    version: "phase6a1-candidate-intent-audit-v1",
    generatedAt,
    bridge: {
      invariant:
        "Oracle mechanism → field-role adjudication → CandidateIntent → retrieval bucket → candidate retrieval → acceptance Top-K",
      acceptancePlan: RETRIEVAL_ACCEPTANCE_PLAN_V4_VERSION,
      gateC: CASE_SPECIFIC_ORACLE_AUDIT_V4_VERSION,
    },
    population: {
      expectedCases: 28,
      profiledCases: profiles.length,
      coreIntentCases: coreCases.length,
      noCoreCases,
      populationCoveragePass,
    },
    v4bComparison: {
      v4bRequirementCount: v4Reqs.length,
      v4bDistinctCaseIds: v4bCaseIds.size,
      candidateIntentCoreCount: totalCoreIntents,
      projectedIntentSurfacePackets: totalProjectedPackets,
      v4RequiredFunctionsOnly,
      v4FieldNameOnlyRatio: v4Reqs.length ? v4FieldNameOnlyCount / v4Reqs.length : 0,
      casesInV4bOnly: [...v4bCaseIds],
      casesMissingFromV4bWithCoreIntent: missingFromV4b,
      knownSemanticFailuresInV4b: knownFailures,
    },
    gates: {
      gateB_candidateIntentReconciliation: {
        pass: gateBPass,
        failureCount: gateBFailures.length,
        failures: gateBFailures.slice(0, 50),
      },
      gateC_commanderAndIntentCausality: {
        pass: gateCPass,
        failureCount: gateCFailures.length,
        failures: gateCFailures.slice(0, 50),
        ...gateCSummary,
      },
      allPass: gateBPass && gateCPass && populationCoveragePass,
    },
    corpusDisposition: {
      v4bStructuralBlinding: "PASS",
      v4bCandidateTupleSet: "FROZEN HISTORICAL DIAGNOSTIC",
      v4bSemanticAcceptanceSurface: "FAIL — field-name-driven requiredFunctions bridge",
      v4bIndependentCandidateLabeling: "DO NOT START",
      v1v2v3v4Labeling: "DO NOT LABEL",
      scoreTuningAgainstV4b: "PROHIBITED",
      reviewerContaminationNote:
        "Superseded v4 rank-bearing artifact was exposed during structural verification — eventual blind adjudication must use uncontaminated reviewer/session.",
    },
    authorization: {
      v4bBlindingImplementation: "ACCEPTED / PASS",
      candidateIntentNormalizationLayer: "GENERATED — PENDING REVIEW",
      full28CaseCandidateSideCausalAudit: "GENERATED — PENDING REVIEW",
      phase6SemanticOverlays: "AUTHORIZED",
      deterministicBucketRouting: "AUTHORIZED",
      phase5Mutation: "PROHIBITED",
      scoreRankTuning: "WAIT",
      candidateAdjudication: "WAIT",
      newBlindGeneration: "WAIT",
      phase6A2: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CATALOG_PATH, JSON.stringify(catalogArtifact, null, 2));
  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));
  writeFileSync(
    RECONCILIATION_PATH,
    JSON.stringify({ version: "phase6a1-candidate-intent-reconciliation-v1", generatedAt, cases: reconciliations }, null, 2),
  );

  console.log(JSON.stringify(audit, null, 2));
  console.log(`\nWrote ${CATALOG_PATH}`);
  console.log(`Wrote ${AUDIT_PATH}`);

  if (!audit.gates.allPass) {
    console.error("\nCANDIDATE INTENT AUDIT — GATES NOT ALL PASS (expected during v4b semantic repair phase)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
