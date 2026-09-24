#!/usr/bin/env npx tsx
/** Gate-v4 successor wrapper: semantic-opportunity repair stack + v3 diagnostic capture pattern. DO NOT RUN without authorization. */
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
const GATE_REPORT_V4 = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v4.json");
const REQUIRED_GATE_V3_SHA256 = "cc269a2b34f809f793d26dd566d8585e6f675d4253a1ad78e12737ab93611d00";
const CONTAINER_STDOUT_ARTIFACT = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v4-container-stdout-v1.txt",
);
const CONTAINER_STDERR_ARTIFACT = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v4-container-stderr-v1.txt",
);

const PATHS = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotRunnerContainer: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v4-diagnostic-capture-v1.ts"),
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
};

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return (result.stdout ?? "").trim();
}

function extractRunnerResultFromStdout(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) return { parsed: false, parseError: "stdout empty" };
  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.unshift(trimmed.slice(firstBrace, lastBrace + 1));
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

  if (!existsSync(GATE_REPORT_V3)) {
    throw new Error(`FAIL_CLOSED: gate-v3 historical failure evidence required before gate-v4 run: ${GATE_REPORT_V3}`);
  }
  const gateV3Sha256 = sha256File(GATE_REPORT_V3);
  if (gateV3Sha256 !== REQUIRED_GATE_V3_SHA256) {
    throw new Error(
      `FAIL_CLOSED: gate-v3 SHA256 mismatch — expected ${REQUIRED_GATE_V3_SHA256}, got ${gateV3Sha256}`,
    );
  }
  if (existsSync(GATE_REPORT_V4)) {
    throw new Error(`FAIL_CLOSED: existing gate-v4 artifact blocks execution: ${GATE_REPORT_V4}`);
  }
  if (existsSync(CONTAINER_STDOUT_ARTIFACT)) {
    throw new Error(`FAIL_CLOSED: existing v4 stdout artifact blocks execution: ${CONTAINER_STDOUT_ARTIFACT}`);
  }
  if (existsSync(CONTAINER_STDERR_ARTIFACT)) {
    throw new Error(`FAIL_CLOSED: existing v4 stderr artifact blocks execution: ${CONTAINER_STDERR_ARTIFACT}`);
  }

  assertPassArtifactAbsentForExecution();

  const artifactOutDir = resolve(MILESTONES, ".pinned-container-artifact-out");
  mkdirSync(artifactOutDir, { recursive: true });
  const passHost = resolve(MILESTONES, PILOT_PASS_ARTIFACT);
  const passContainer = resolve(artifactOutDir, PILOT_PASS_ARTIFACT);
  if (existsSync(passHost)) {
    throw new Error(`FAIL_CLOSED: existing canonical host PASS artifact blocks execution: ${passHost}`);
  }
  if (existsSync(passContainer)) {
    throw new Error(`FAIL_CLOSED: existing container PASS artifact blocks execution: ${passContainer}`);
  }

  const staging = buildImplementationExecutionTree();

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

  const pass = container.exitCode === 0 && existsSync(passContainer);
  if (pass && !existsSync(passHost)) copyFileSync(passContainer, passHost);

  const runnerSummary = extractRunnerResultFromStdout(container.stdout);
  const gateV3 = JSON.parse(readFileSync(GATE_REPORT_V3, "utf8")) as {
    generatedAt?: string;
    decision?: string;
    singleFinalStackIdentity?: string;
  };

  const gate = {
    version: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v4",
    generatedAt: new Date().toISOString(),
    decision: pass ? "SERIALIZATION_PILOT_PASS" : "SERIALIZATION_PILOT_FAIL_CLOSED",
    repairDecision: "ROOT-CAUSE_REPAIR_SEMANTIC_OPPORTUNITY_COVERAGE",
    diagnosticCapture: true,
    predecessorGateV3Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json",
    predecessorGateV3Present: true,
    predecessorGateV3Sha256: gateV3Sha256,
    requiredGateV3Sha256: REQUIRED_GATE_V3_SHA256,
    predecessorGateV3GeneratedAt: gateV3.generatedAt ?? null,
    predecessorGateV3Decision: gateV3.decision ?? null,
    predecessorGateV3SingleFinalStackIdentity: gateV3.singleFinalStackIdentity ?? null,
    preservedHistoricalEvidence: {
      gateV1Present: existsSync(GATE_REPORT_V1),
      gateV2Present: existsSync(GATE_REPORT_V2),
      gateV2Sha256: existsSync(GATE_REPORT_V2) ? sha256File(GATE_REPORT_V2) : null,
      gateV3StdoutArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
      gateV3StderrArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
    },
    repositoryIdentity: {
      gitHead: runGit(["rev-parse", "HEAD"]),
      gitBranch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
      pinnedRepositoryIdentity: repositoryIdentity,
    },
    singleFinalStackIdentity: expectedStackIdentity,
    stackIdentityInputs: stackInputs,
    implementationExecutionTree,
    invokedShellCommand: container.invokedShellCommand,
    catalogDataStateVerificationByteSha256: stackInputs.catalogDataState.catalogDataStateVerificationByteSha256,
    containerStdoutArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v4-container-stdout-v1.txt",
    containerStdoutArtifactSha256: sha256File(CONTAINER_STDOUT_ARTIFACT),
    containerStderrArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v4-container-stderr-v1.txt",
    containerStderrArtifactSha256: sha256File(CONTAINER_STDERR_ARTIFACT),
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
    instruction: "REPORT_AND_WAIT",
  };

  writeOnceMilestoneArtifact(GATE_REPORT_V4, gate);
  console.log(JSON.stringify(gate, null, 2));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
