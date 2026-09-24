#!/usr/bin/env npx tsx
/** Gate-v3 successor wrapper: full container stdout/stderr capture after immutable gate-v2 failure. */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  MILESTONES,
  REPO,
  buildFilteredEnvFile,
  buildImplementationExecutionTree,
  cleanupStagingRoot,
  runInPinnedImplementationContainer,
  sha256File,
} from "./lib/phase6a1-pinned-implementation-container-v1";
import { PILOT_PASS_ARTIFACT } from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import {
  buildPilotStackIdentityInputs,
  computeSingleFinalStackIdentity,
  resolveRepositoryIdentityPin,
} from "./lib/phase6a1-professor-plan-serialization-pilot-stack-v1";
import { assertPassArtifactAbsentForExecution } from "./lib/phase6a1-serialization-pilot-artifact-routing-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./lib/write-once-text-artifact-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const PILOT_SCRIPT = "scripts/run-phase6a1-run-serialization-pilot-v8.ts";
const GATE_REPORT_V1 = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v1.json");
const GATE_REPORT_V2 = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json");
const GATE_REPORT_V3 = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json");
const CONTAINER_STDOUT_ARTIFACT = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
);
const CONTAINER_STDERR_ARTIFACT = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
);

const PATHS = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotRunnerContainer: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v3-diagnostic-capture-v1.ts"),
  pinnedContainerHelper: resolve(HERE, "lib/phase6a1-pinned-implementation-container-v1.ts"),
  config: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  serializer: resolve(HERE, "lib/phase6a1-professor-plan-serializer-v1.ts"),
  losslessness: resolve(HERE, "lib/phase6a1-professor-plan-serialization-losslessness-v1.ts"),
  semanticProjection: resolve(HERE, "lib/phase6a1-professor-plan-serialization-semantic-projection-v1.ts"),
  runtimeSchemaValidator: resolve(HERE, "lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts"),
  artifactRouting: resolve(HERE, "lib/phase6a1-serialization-pilot-artifact-routing-v1.ts"),
  harmony: resolve(HERE, "lib/phase6a1-professor-plan-serialization-harmony-v1.ts"),
  stackIdentity: resolve(HERE, "lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  spentPilotTruthLoader: resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  spentPilotAdjudication: resolve(HERE, "lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts"),
};

type PilotFailureClass =
  | "UPSTREAM_PROFESSOR_FAILURE"
  | "VALIDATOR_FAILURE"
  | "SERIALIZER_SCHEMA_FAILURE"
  | "SERIALIZER_SEMANTIC_LOSS"
  | "HARMONY_RULE_FAILURE"
  | "CATALOG_STATE_VERIFICATION_FAILURE";

type PerCommanderResult = {
  pilotCaseId: string;
  commander?: string;
  pass?: boolean;
  failureClass?: PilotFailureClass;
  attempts?: number;
  issues?: string[];
  professorCaseStatus?: string;
};

type RunnerResult = {
  decision?: string;
  pass?: boolean;
  perCommanderResults?: PerCommanderResult[];
};

type PassArtifact = {
  singleFinalStackIdentity: string;
  catalogDataStateVerificationByteSha256: string;
  thisRunProof?: {
    singleFinalStackIdentity: string;
    catalogDataStateVerificationByteSha256: string;
    perCaseSha256s: Array<{
      pilotCaseId: string;
      professorRecordSha256?: string;
      runtimeInputV8Sha256?: string;
      requiredSemanticProjectionSha256?: string;
    }>;
  };
  perCaseEvidence?: Array<{
    pilotCaseId: string;
    professorRecordRelativePath: string;
    professorRecordSha256: string;
    runtimeInputV8RelativePath: string;
    runtimeInputV8Sha256: string;
    requiredSemanticProjectionSha256: string;
  }>;
};

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return (result.stdout ?? "").trim();
}

function validateThisRunPassArtifact(args: {
  passPath: string;
  expectedStackIdentity: string;
  expectedCatalogVerifierSha: string;
  artifactOutDir: string;
}): void {
  const raw = readFileSync(args.passPath, "utf8");
  const parsed = JSON.parse(raw) as PassArtifact;
  if (parsed.singleFinalStackIdentity !== args.expectedStackIdentity) {
    throw new Error("FAIL_CLOSED: PASS artifact singleFinalStackIdentity does not match current execution");
  }
  if (parsed.catalogDataStateVerificationByteSha256 !== args.expectedCatalogVerifierSha) {
    throw new Error("FAIL_CLOSED: PASS artifact catalog verifier SHA does not match current execution");
  }
  if (parsed.thisRunProof?.singleFinalStackIdentity !== args.expectedStackIdentity) {
    throw new Error("FAIL_CLOSED: PASS artifact thisRunProof stack identity mismatch");
  }
  for (const pin of parsed.perCaseEvidence ?? []) {
    const professorPath = resolve(args.artifactOutDir, pin.professorRecordRelativePath);
    const runtimePath = resolve(args.artifactOutDir, pin.runtimeInputV8RelativePath);
    if (!existsSync(professorPath) || sha256File(professorPath) !== pin.professorRecordSha256) {
      throw new Error(`FAIL_CLOSED: per-case professor record SHA mismatch for ${pin.pilotCaseId}`);
    }
    if (!existsSync(runtimePath) || sha256File(runtimePath) !== pin.runtimeInputV8Sha256) {
      throw new Error(`FAIL_CLOSED: per-case runtime-input-v8 SHA mismatch for ${pin.pilotCaseId}`);
    }
  }
}

function extractRunnerResultFromStdout(stdout: string): {
  parsed: boolean;
  runnerResult?: RunnerResult;
  failedPilotCaseId?: string | null;
  failureClass?: PilotFailureClass | null;
  issues?: string[];
  attempts?: number | null;
  parseError?: string;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { parsed: false, parseError: "stdout empty" };
  }

  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.unshift(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const runnerResult = JSON.parse(candidate) as RunnerResult;
      const failed = runnerResult.perCommanderResults?.find((row) => row.pass === false);
      return {
        parsed: true,
        runnerResult,
        failedPilotCaseId: failed?.pilotCaseId ?? null,
        failureClass: failed?.failureClass ?? null,
        issues: failed?.issues ?? [],
        attempts: failed?.attempts ?? null,
      };
    } catch {
      continue;
    }
  }

  return { parsed: false, parseError: "stdout did not contain parseable runner JSON" };
}

async function main() {
  if (process.env.PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED !== "1") {
    console.log(
      JSON.stringify(
        {
          status: "BLOCKED",
          reason: "Independent catalog verifier PASS not confirmed",
          instruction: "Set PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED=1 after independent review, then rerun.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  if (!existsSync(GATE_REPORT_V2)) {
    throw new Error(`FAIL_CLOSED: gate-v2 historical failure evidence required before gate-v3 run: ${GATE_REPORT_V2}`);
  }
  if (existsSync(GATE_REPORT_V3)) {
    throw new Error(`FAIL_CLOSED: existing gate-v3 artifact blocks execution: ${GATE_REPORT_V3}`);
  }

  assertPassArtifactAbsentForExecution();

  const staging = buildImplementationExecutionTree();
  const artifactOutDir = resolve(MILESTONES, ".pinned-container-artifact-out");
  mkdirSync(artifactOutDir, { recursive: true });
  const passHost = resolve(MILESTONES, PILOT_PASS_ARTIFACT);
  const passContainer = resolve(artifactOutDir, PILOT_PASS_ARTIFACT);
  if (existsSync(passHost)) {
    throw new Error(`FAIL_CLOSED: existing PASS artifact blocks execution: ${passHost}`);
  }
  if (existsSync(passContainer)) {
    throw new Error(`FAIL_CLOSED: existing PASS artifact blocks execution: ${passContainer}`);
  }
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
    runtimeInputV8SchemaValidatorPath: PATHS.runtimeSchemaValidator,
    artifactRoutingPath: PATHS.artifactRouting,
    harmonyPath: PATHS.harmony,
    stackIdentityPath: PATHS.stackIdentity,
    spentPilotTruthLoaderPath: PATHS.spentPilotTruthLoader,
    spentPilotAdjudicationPath: PATHS.spentPilotAdjudication,
    implementationExecutionTree,
  });
  const expectedStackIdentity = computeSingleFinalStackIdentity(stackInputs);
  const pilotExtraEnv = {
    PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED: "1",
    PHASE6A1_ARTIFACT_OUTPUT_DIR: "/artifact-out",
    PHASE6A1_PINNED_REPOSITORY_IDENTITY: JSON.stringify(repositoryIdentity),
    PHASE6A1_IMPLEMENTATION_EXECUTION_TREE_MANIFEST: JSON.stringify(implementationExecutionTree),
  };

  const container = runInPinnedImplementationContainer({
    stagingTreeRoot: staging.stagingTreeRoot,
    artifactOutDir,
    envFilePath,
    scriptRelFromWeb: PILOT_SCRIPT,
    scriptArgs: ["--execute"],
    extraEnv: pilotExtraEnv,
    treeManifestSha256: staging.treeManifestSha256,
    treeFileCount: staging.treeFileCount,
  });

  cleanupStagingRoot(staging.stagingRoot);

  writeOnceTextArtifact(CONTAINER_STDOUT_ARTIFACT, container.stdout);
  writeOnceTextArtifact(CONTAINER_STDERR_ARTIFACT, container.stderr);

  const catalogVerifierSha = stackInputs.catalogDataState.catalogDataStateVerificationByteSha256;
  let pass = false;
  if (container.exitCode === 0 && existsSync(passContainer)) {
    validateThisRunPassArtifact({
      passPath: passContainer,
      expectedStackIdentity,
      expectedCatalogVerifierSha: catalogVerifierSha,
      artifactOutDir,
    });
    if (!existsSync(passHost)) {
      copyFileSync(passContainer, passHost);
    }
    pass = true;
  }

  const runnerSummary = extractRunnerResultFromStdout(container.stdout);
  const gateV2 = JSON.parse(readFileSync(GATE_REPORT_V2, "utf8")) as {
    generatedAt?: string;
    decision?: string;
    singleFinalStackIdentity?: string;
  };

  const gate = {
    version: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3",
    generatedAt: new Date().toISOString(),
    decision: pass ? "SERIALIZATION_PILOT_PASS" : "SERIALIZATION_PILOT_FAIL_CLOSED",
    diagnosticCapture: true,
    predecessorGateV2Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json",
    predecessorGateV2Present: true,
    predecessorGateV2Sha256: sha256File(GATE_REPORT_V2),
    predecessorGateV2GeneratedAt: gateV2.generatedAt ?? null,
    predecessorGateV2Decision: gateV2.decision ?? null,
    predecessorGateV2SingleFinalStackIdentity: gateV2.singleFinalStackIdentity ?? null,
    historicalFailedGateV1Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v1.json",
    historicalFailedGateV1Present: existsSync(GATE_REPORT_V1),
    repositoryIdentity: {
      gitHead: runGit(["rev-parse", "HEAD"]),
      gitBranch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
      pinnedRepositoryIdentity: repositoryIdentity,
    },
    singleFinalStackIdentity: expectedStackIdentity,
    implementationExecutionTree: {
      manifestSha256: implementationExecutionTree.manifestSha256,
      fileCount: implementationExecutionTree.fileCount,
      archiveByteSha256: implementationExecutionTree.archiveByteSha256,
      overlayFileCount: implementationExecutionTree.overlayFileCount,
    },
    invokedShellCommand: container.invokedShellCommand,
    catalogDataStateVerificationByteSha256: catalogVerifierSha,
    boundary: {
      containerImage: container.boundary.containerImage,
      containerImageDigest: container.boundary.containerImageDigest,
      implementationExecutionTreeManifestSha256: container.boundary.implementationExecutionTreeManifestSha256,
      implementationExecutionTreeFileCount: container.boundary.implementationExecutionTreeFileCount,
      benchmarkAuthorityMounted: container.boundary.benchmarkAuthorityMounted,
      dockerSocketMounted: container.boundary.dockerSocketMounted,
      nodeModulesHostMount: container.boundary.nodeModulesHostMount,
      artifactOutputMount: container.boundary.artifactOutputMount,
    },
    containerStdoutArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
    containerStdoutArtifactSha256: sha256File(CONTAINER_STDOUT_ARTIFACT),
    containerStdoutByteSize: Buffer.byteLength(container.stdout, "utf8"),
    containerStderrArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
    containerStderrArtifactSha256: sha256File(CONTAINER_STDERR_ARTIFACT),
    containerStderrByteSize: Buffer.byteLength(container.stderr, "utf8"),
    passArtifact: PILOT_PASS_ARTIFACT,
    passArtifactSha256: pass && existsSync(passContainer) ? sha256File(passContainer) : null,
    containerExitCode: container.exitCode,
    runnerResultExtraction: {
      parsed: runnerSummary.parsed,
      parseError: runnerSummary.parseError ?? null,
      decision: runnerSummary.runnerResult?.decision ?? null,
      pass: runnerSummary.runnerResult?.pass ?? null,
      failedPilotCaseId: runnerSummary.failedPilotCaseId ?? null,
      failureClass: runnerSummary.failureClass ?? null,
      attempts: runnerSummary.attempts ?? null,
      issues: runnerSummary.issues ?? [],
      perCommanderResults: runnerSummary.runnerResult?.perCommanderResults ?? null,
    },
    instruction: pass ? "REPORT_AND_WAIT" : "FAIL_CLOSED",
  };

  writeOnceMilestoneArtifact(GATE_REPORT_V3, gate);

  console.log(JSON.stringify(gate, null, 2));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
