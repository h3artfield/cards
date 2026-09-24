#!/usr/bin/env npx tsx
/**
 * Pre-execution hash report v2 for serialization pilot infrastructure repairs.
 * Emits pinned byte SHAs and REPORT AND WAIT — does not execute pilot.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImplementationExecutionTree,
  cleanupStagingRoot,
  sha256File,
} from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  buildPilotStackIdentityInputs,
  computeSingleFinalStackIdentity,
} from "./lib/phase6a1-professor-plan-serialization-pilot-stack-v1";
import {
  getSpentPilotMechanismTruthSupplementSha256,
  getSpentPilotOpportunitySupplementSha256,
  assertPilotTruthSupplementsPresent,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import {
  CATALOG_VERIFIER_PATH,
  MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
  OPPORTUNITY_SUPPLEMENT_ARTIFACT,
  PILOT_SPEC_ARTIFACT,
} from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v2.json");

const PATHS = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotRunnerContainer: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts"),
  pinnedContainerHelper: resolve(HERE, "lib/phase6a1-pinned-implementation-container-v1.ts"),
  catalogVerifierScript: resolve(HERE, "run-phase6a1-verify-pinned-catalog-data-state-v2.ts"),
  serializer: resolve(HERE, "lib/phase6a1-professor-plan-serializer-v1.ts"),
  losslessness: resolve(HERE, "lib/phase6a1-professor-plan-serialization-losslessness-v1.ts"),
  semanticProjection: resolve(HERE, "lib/phase6a1-professor-plan-serialization-semantic-projection-v1.ts"),
  runtimeInputV8SchemaValidator: resolve(HERE, "lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts"),
  artifactRouting: resolve(HERE, "lib/phase6a1-serialization-pilot-artifact-routing-v1.ts"),
  harmony: resolve(HERE, "lib/phase6a1-professor-plan-serialization-harmony-v1.ts"),
  stackIdentity: resolve(HERE, "lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  spentPilotTruthLoader: resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  spentPilotAdjudication: resolve(HERE, "lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts"),
  spentPilotConfig: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  buildSupplement: resolve(HERE, "run-phase6a1-build-spent-pilot-mechanism-truth-supplement-v1.ts"),
};

const COMMAND_EVIDENCE_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-pinned-container-command-evidence-v1.json",
);

const REVIEWED_MATERIAL_SHA256 = {
  pilotRunner: "c593a96af5b1333396360f75bed0316b9e4bb684e8605691e06443985ff018f1",
  serializer: "1a5a872578eaf7b28e026b414c68af5046d857f7cb5c4a311846708c69eb40ae",
  semanticProjection: "e022d92963f250f14fc472d222b1ee506f7375913f7dd5645df6b301b32ceb41",
  losslessness: "21d0a7836b6da8db33b4f66c1cdb58939df1e2e39398e41035d5454b576cda8f",
  runtimeInputV8SchemaValidator: "7a92839cb2eaaf2e40a8b4a3f98d9492921a0e59b543d0b984d8d9dc5e70e376",
  harmony: "a4715cf7239ea229e24bc972d1d20388cc5f81df610bbaeae97fcd386e0b8a68",
  stackIdentity: "631945c2ec8679350238f020e6fb2b0d027de7294776c0140265ee6282db876a",
  spentPilotTruthLoader: "068c8b95d4f5e061e299e44e178c24e2ef93cff041fa1c7d6bc4fec5f58b8dbf",
  spentPilotAdjudication: "7e72125c676de0d416662d167aa347bc81746a0cc0fad10d1f76fd62e75ea745",
  pilotConfig: "17611416e63d64e8105b0f85ca5bbf5a2638937016c399f572db217817524b08",
  mechanismTruthSupplement: "44b59eb939edfccfdb372601f548adeac074366de77751efd112d87001bba6ad",
  opportunitySupplement: "f3ac33428de340d65ba720c3b184f8ad5141b8f328249d6bc22a9970aa33648c",
} as const;

const CATALOG_VERIFIER_PASS_GATE = resolve(
  MILESTONES,
  "phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1.json",
);
const STALE_CATALOG_VERIFIER_FAIL_GATE = resolve(
  MILESTONES,
  "phase6a1-professor-plan-catalog-verifier-v2-pinned-container-gate-v1.json",
);

function main() {
  assertPilotTruthSupplementsPresent();

  const staging = buildImplementationExecutionTree();
  const implementationExecutionTree = {
    manifestSha256: staging.treeManifestSha256,
    fileCount: staging.treeFileCount,
    archiveByteSha256: staging.archiveByteSha256,
    overlayFileCount: staging.overlayFileCount,
  };

  const stackInputs = buildPilotStackIdentityInputs({
    pilotRunnerPath: PATHS.pilotRunner,
    pilotRunnerContainerWrapperPath: PATHS.pilotRunnerContainer,
    pinnedContainerHelperPath: PATHS.pinnedContainerHelper,
    configPath: PATHS.spentPilotConfig,
    serializerPath: PATHS.serializer,
    losslessnessPath: PATHS.losslessness,
    semanticProjectionPath: PATHS.semanticProjection,
    runtimeInputV8SchemaValidatorPath: PATHS.runtimeInputV8SchemaValidator,
    artifactRoutingPath: PATHS.artifactRouting,
    harmonyPath: PATHS.harmony,
    stackIdentityPath: PATHS.stackIdentity,
    spentPilotTruthLoaderPath: PATHS.spentPilotTruthLoader,
    spentPilotAdjudicationPath: PATHS.spentPilotAdjudication,
    implementationExecutionTree,
  });
  cleanupStagingRoot(staging.stagingRoot);

  const singleFinalStackIdentity = computeSingleFinalStackIdentity(stackInputs);

  const catalogVerifierPresent = existsSync(CATALOG_VERIFIER_PATH);
  const catalogVerifier = catalogVerifierPresent
    ? (JSON.parse(readFileSync(CATALOG_VERIFIER_PATH, "utf8")) as { pass?: boolean })
    : null;

  const report = {
    version: "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v2",
    generatedAt: new Date().toISOString(),
    decision: "SERIALIZATION_PILOT_ORCHESTRATION_REPAIR_BLOCK_V1_GATE_EVIDENCE_TARGET",
    predecessorDecision: "SERIALIZATION_PILOT_ORCHESTRATION_REPAIR_AWAITING_INDEPENDENT_CONFIRMATION",
    executionStatus: "GATE_V2_WRITE_ONCE_REPAIR_AWAITING_INDEPENDENT_CONFIRMATION",
    instruction:
      "REPORT AND WAIT — do not execute 5/5 pilot until independent confirmation of gate-v2 write-once orchestration repair.",
    immutablePilotCommanders: [
      "Muldrotha, the Gravetide",
      "Zaxara, the Exemplary",
      "Korvold, Fae-Cursed King",
      "Prosper, Tome-Bound",
      "Omnath, Locus of Rage",
    ],
    implementationExecutionTree,
    componentHashes: {
      pilotRunner: { path: "web/scripts/run-phase6a1-run-serialization-pilot-v8.ts", sha256: sha256File(PATHS.pilotRunner) },
      pilotRunnerContainerWrapper: {
        path: "web/scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts",
        sha256: sha256File(PATHS.pilotRunnerContainer),
      },
      pinnedContainerHelper: {
        path: "web/scripts/lib/phase6a1-pinned-implementation-container-v1.ts",
        sha256: sha256File(PATHS.pinnedContainerHelper),
      },
      catalogVerifierScript: {
        path: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v2.ts",
        sha256: sha256File(PATHS.catalogVerifierScript),
      },
      professorToRuntimeSerializer: {
        path: "web/scripts/lib/phase6a1-professor-plan-serializer-v1.ts",
        sha256: sha256File(PATHS.serializer),
      },
      semanticProjection: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-semantic-projection-v1.ts",
        sha256: sha256File(PATHS.semanticProjection),
      },
      semanticLosslessnessGate: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-losslessness-v1.ts",
        sha256: sha256File(PATHS.losslessness),
      },
      runtimeInputV8SchemaValidator: {
        path: "web/scripts/lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts",
        sha256: sha256File(PATHS.runtimeInputV8SchemaValidator),
      },
      artifactRouting: {
        path: "web/scripts/lib/phase6a1-serialization-pilot-artifact-routing-v1.ts",
        sha256: sha256File(PATHS.artifactRouting),
      },
      harmonyFrozenEvidenceValidator: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-harmony-v1.ts",
        sha256: sha256File(PATHS.harmony),
      },
      stackIdentityBuilder: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts",
        sha256: sha256File(PATHS.stackIdentity),
      },
      spentPilotTruthLoader: {
        path: "web/scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts",
        sha256: sha256File(PATHS.spentPilotTruthLoader),
      },
      spentPilotAdjudicationModule: {
        path: "web/scripts/lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts",
        sha256: sha256File(PATHS.spentPilotAdjudication),
      },
      buildSupplementScript: {
        path: "web/scripts/run-phase6a1-build-spent-pilot-mechanism-truth-supplement-v1.ts",
        sha256: sha256File(PATHS.buildSupplement),
      },
      pilotConfig: {
        path: "web/scripts/lib/phase6a1-serialization-pilot-v8-config-v1.ts",
        sha256: sha256File(PATHS.spentPilotConfig),
      },
    },
    supplementArtifacts: {
      mechanismTruthSupplement: {
        artifact: MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
        sha256: getSpentPilotMechanismTruthSupplementSha256(),
        cases: ["multi-muldrotha", "blindv5-52-tokens", "single-landfall-omnath"],
      },
      opportunitySupplement: {
        artifact: OPPORTUNITY_SUPPLEMENT_ARTIFACT,
        sha256: getSpentPilotOpportunitySupplementSha256(),
      },
    },
    pilotSpec: {
      artifact: PILOT_SPEC_ARTIFACT,
      sha256: sha256File(resolve(MILESTONES, PILOT_SPEC_ARTIFACT)),
    },
    catalogVerifierV2: {
      artifact: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
      present: catalogVerifierPresent,
      pass: catalogVerifier?.pass ?? null,
      sha256: catalogVerifierPresent ? sha256File(CATALOG_VERIFIER_PATH) : null,
      pinnedContainerPassGate: {
        artifact: "phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1.json",
        present: existsSync(CATALOG_VERIFIER_PASS_GATE),
        sha256: existsSync(CATALOG_VERIFIER_PASS_GATE) ? sha256File(CATALOG_VERIFIER_PASS_GATE) : null,
        decision: existsSync(CATALOG_VERIFIER_PASS_GATE)
          ? (JSON.parse(readFileSync(CATALOG_VERIFIER_PASS_GATE, "utf8")) as { decision?: string }).decision ?? null
          : null,
        verifierArtifactSha256: existsSync(CATALOG_VERIFIER_PASS_GATE)
          ? (
              JSON.parse(readFileSync(CATALOG_VERIFIER_PASS_GATE, "utf8")) as {
                artifacts?: { catalogVerifierV2?: { sha256?: string } };
              }
            ).artifacts?.catalogVerifierV2?.sha256 ?? null
          : null,
        supersedesStaleGateArtifact: "phase6a1-professor-plan-catalog-verifier-v2-pinned-container-gate-v1.json",
        staleGateArtifactSha256: existsSync(STALE_CATALOG_VERIFIER_FAIL_GATE)
          ? sha256File(STALE_CATALOG_VERIFIER_FAIL_GATE)
          : null,
      },
      independentConfirmationRequired: true,
      note: "PASS boundary evidence is the post-repair pinned-container gate, not the stale pre-repair FAIL gate.",
    },
    singleFinalStackIdentity,
    stackIdentityInputs: stackInputs,
    materialPinVerification: {
      reviewedAgainst: "phase6a1-serialization-pilot-pre-execution-review-v2-delta",
      checks: [
        { component: "pilotRunner", reviewedSha256: REVIEWED_MATERIAL_SHA256.pilotRunner, currentSha256: sha256File(PATHS.pilotRunner) },
        { component: "serializer", reviewedSha256: REVIEWED_MATERIAL_SHA256.serializer, currentSha256: sha256File(PATHS.serializer) },
        { component: "semanticProjection", reviewedSha256: REVIEWED_MATERIAL_SHA256.semanticProjection, currentSha256: sha256File(PATHS.semanticProjection) },
        { component: "losslessness", reviewedSha256: REVIEWED_MATERIAL_SHA256.losslessness, currentSha256: sha256File(PATHS.losslessness) },
        { component: "runtimeInputV8SchemaValidator", reviewedSha256: REVIEWED_MATERIAL_SHA256.runtimeInputV8SchemaValidator, currentSha256: sha256File(PATHS.runtimeInputV8SchemaValidator) },
        { component: "harmony", reviewedSha256: REVIEWED_MATERIAL_SHA256.harmony, currentSha256: sha256File(PATHS.harmony) },
        { component: "stackIdentity", reviewedSha256: REVIEWED_MATERIAL_SHA256.stackIdentity, currentSha256: sha256File(PATHS.stackIdentity) },
        { component: "spentPilotTruthLoader", reviewedSha256: REVIEWED_MATERIAL_SHA256.spentPilotTruthLoader, currentSha256: sha256File(PATHS.spentPilotTruthLoader) },
        { component: "spentPilotAdjudication", reviewedSha256: REVIEWED_MATERIAL_SHA256.spentPilotAdjudication, currentSha256: sha256File(PATHS.spentPilotAdjudication) },
        { component: "pilotConfig", reviewedSha256: REVIEWED_MATERIAL_SHA256.pilotConfig, currentSha256: sha256File(PATHS.spentPilotConfig) },
        { component: "mechanismTruthSupplement", reviewedSha256: REVIEWED_MATERIAL_SHA256.mechanismTruthSupplement, currentSha256: getSpentPilotMechanismTruthSupplementSha256() },
        { component: "opportunitySupplement", reviewedSha256: REVIEWED_MATERIAL_SHA256.opportunitySupplement, currentSha256: getSpentPilotOpportunitySupplementSha256() },
      ].map((row) => ({ ...row, match: row.reviewedSha256 === row.currentSha256 })),
      orchestrationChanges: {
        pinnedContainerHelper: { currentSha256: sha256File(PATHS.pinnedContainerHelper) },
        pilotRunnerContainerWrapper: { currentSha256: sha256File(PATHS.pilotRunnerContainer) },
      },
    },
    commandConstructionEvidence: {
      artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-command-evidence-v1.json",
      present: existsSync(COMMAND_EVIDENCE_PATH),
      sha256: existsSync(COMMAND_EVIDENCE_PATH) ? sha256File(COMMAND_EVIDENCE_PATH) : null,
      scriptRelFromWeb: "scripts/run-phase6a1-run-serialization-pilot-v8.ts",
      scriptArgs: ["--execute"],
    },
    executionGate: {
      requiredEnv: "PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED=1",
      requiredScriptArgs: ["--execute"],
      runtimeInputV8SchemaValidation: true,
      failClosedOnExistingPassArtifact: true,
      failClosedOnExistingGateV2Artifact: true,
      pinnedContainerScript: "web/scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts",
      gateArtifactOnExecution: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json",
      historicalFailedGateV1Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v1.json",
      passArtifactOnSuccess: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
      artifactOutputMount: "/artifact-out",
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
