#!/usr/bin/env npx tsx
/**
 * Dry-run command-construction evidence for serialization pilot pinned-container invocation.
 * Does not run Docker or invoke Professor cases.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTAINER_IMAGE,
  CONTAINER_IMAGE_DIGEST,
  MILESTONES,
  buildFilteredEnvFile,
  buildImplementationExecutionTree,
  buildPinnedContainerDockerInvocation,
  buildPinnedContainerShellCommand,
  cleanupStagingRoot,
  sha256File,
} from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  buildPilotStackIdentityInputs,
  computeSingleFinalStackIdentity,
  resolveRepositoryIdentityPin,
} from "./lib/phase6a1-professor-plan-serialization-pilot-stack-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-pinned-container-command-evidence-v1.json",
);
const PILOT_SCRIPT = "scripts/run-phase6a1-run-serialization-pilot-v8.ts";
const PILOT_SCRIPT_ARGS = ["--execute"] as const;

const PATHS = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotRunnerContainer: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts"),
  pinnedContainerHelper: resolve(HERE, "lib/phase6a1-pinned-implementation-container-v1.ts"),
  config: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  serializer: resolve(HERE, "lib/phase6a1-professor-plan-serializer-v1.ts"),
  losslessness: resolve(HERE, "lib/phase6a1-professor-plan-serialization-losslessness-v1.ts"),
  semanticProjection: resolve(HERE, "lib/phase6a1-professor-plan-serialization-semantic-projection-v1.ts"),
  runtimeInputV8SchemaValidator: resolve(HERE, "lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts"),
  artifactRouting: resolve(HERE, "lib/phase6a1-serialization-pilot-artifact-routing-v1.ts"),
  harmony: resolve(HERE, "lib/phase6a1-professor-plan-serialization-harmony-v1.ts"),
  stackIdentity: resolve(HERE, "lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  spentPilotTruthLoader: resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  spentPilotAdjudication: resolve(HERE, "lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts"),
};

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
} as const;

const REVIEWED_MATERIAL_PATHS: Record<keyof typeof REVIEWED_MATERIAL_SHA256, string> = {
  pilotRunner: PATHS.pilotRunner,
  serializer: PATHS.serializer,
  semanticProjection: PATHS.semanticProjection,
  losslessness: PATHS.losslessness,
  runtimeInputV8SchemaValidator: PATHS.runtimeInputV8SchemaValidator,
  harmony: PATHS.harmony,
  stackIdentity: PATHS.stackIdentity,
  spentPilotTruthLoader: PATHS.spentPilotTruthLoader,
  spentPilotAdjudication: PATHS.spentPilotAdjudication,
  pilotConfig: PATHS.config,
};

function main() {
  const staging = buildImplementationExecutionTree();
  const artifactOutDir = resolve(MILESTONES, ".pinned-container-artifact-out");
  const envFilePath = buildFilteredEnvFile(["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_KEY"], true);
  const repositoryIdentity = resolveRepositoryIdentityPin();
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
    configPath: PATHS.config,
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

  const extraEnv = {
    PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED: "1",
    PHASE6A1_ARTIFACT_OUTPUT_DIR: "/artifact-out",
    PHASE6A1_PINNED_REPOSITORY_IDENTITY: JSON.stringify(repositoryIdentity),
    PHASE6A1_IMPLEMENTATION_EXECUTION_TREE_MANIFEST: JSON.stringify(implementationExecutionTree),
  };
  const { dockerArgv, invokedShellCommand } = buildPinnedContainerDockerInvocation({
    stagingTreeRoot: "<stagingTreeRoot>",
    artifactOutDir,
    envFilePath,
    scriptRelFromWeb: PILOT_SCRIPT,
    scriptArgs: [...PILOT_SCRIPT_ARGS],
    extraEnv,
  });

  const expectedShellCommand = buildPinnedContainerShellCommand(PILOT_SCRIPT, [...PILOT_SCRIPT_ARGS]);
  const materialPinChecks = Object.entries(REVIEWED_MATERIAL_SHA256).map(([component, reviewedSha256]) => {
    const currentSha256 = sha256File(REVIEWED_MATERIAL_PATHS[component as keyof typeof REVIEWED_MATERIAL_SHA256]);
    return {
      component,
      reviewedSha256,
      currentSha256,
      match: currentSha256 === reviewedSha256,
    };
  });
  const orchestrationPinChecks = [
    {
      component: "pinnedContainerHelper",
      currentSha256: sha256File(PATHS.pinnedContainerHelper),
    },
    {
      component: "pilotRunnerContainerWrapper",
      currentSha256: sha256File(PATHS.pilotRunnerContainer),
    },
  ];

  const evidence = {
    version: "phase6a1-professor-plan-serialization-pilot-pinned-container-command-evidence-v1",
    generatedAt: new Date().toISOString(),
    decision: "SERIALIZATION_PILOT_ORCHESTRATION_REPAIR_COMMAND_EVIDENCE",
    instruction: "REPORT AND WAIT — dry-run only; no Docker execution and no Professor cases invoked.",
    scriptRelFromWeb: PILOT_SCRIPT,
    scriptArgs: [...PILOT_SCRIPT_ARGS],
    requiredEnv: {
      PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED: "1",
    },
    invokedShellCommand,
    expectedShellCommand,
    shellCommandChecks: {
      includesPilotScript: invokedShellCommand.includes(PILOT_SCRIPT),
      includesExecuteFlag: invokedShellCommand.includes("--execute"),
      exactExpectedShellCommand: invokedShellCommand === expectedShellCommand,
    },
    dockerInvocationTemplate: {
      containerImage: CONTAINER_IMAGE,
      containerImageDigest: CONTAINER_IMAGE_DIGEST,
      dockerArgvTail: dockerArgv.slice(-4),
      envIncludesCatalogVerifierPassConfirmed: dockerArgv.some(
        (arg) => arg === "PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED=1",
      ),
    },
    singleFinalStackIdentity: computeSingleFinalStackIdentity(stackInputs),
    implementationExecutionTree,
    materialPinChecks,
    orchestrationPinChecks,
    allReviewedMaterialPinsMatch: materialPinChecks.every((c) => c.match),
  };

  writeFileSync(OUT_PATH, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}

main();
