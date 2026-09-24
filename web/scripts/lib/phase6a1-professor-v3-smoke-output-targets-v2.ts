/**
 * Write-once output preflight for Professor v3 Muldrotha smoke v2.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V3_SMOKE_OUTPUT_TARGETS_V2_VERSION = "phase6a1-professor-v3-smoke-output-targets-v2";

export const PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2 = {
  result: "phase6a1-professor-v3-smoke-muldrotha-result-v1.json",
  executionTrace: "phase6a1-professor-v3-smoke-muldrotha-execution-trace-v1.json",
  runLedger: "phase6a1-professor-v3-smoke-muldrotha-run-ledger-v1.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-muldrotha-model-attempts-v1",
  stdout: "phase6a1-professor-v3-smoke-muldrotha-stdout-v1.txt",
  stderr: "phase6a1-professor-v3-smoke-muldrotha-stderr-v1.txt",
  manifest: "phase6a1-professor-v3-smoke-muldrotha-manifest-v1.json",
  failure: "phase6a1-professor-v3-smoke-muldrotha-failure-v1.json",
} as const;

export type ProfessorV3SmokeOutputTargetsV2 = {
  milestonesDir: string;
  result: string;
  executionTrace: string;
  runLedger: string;
  modelAttemptsDir: string;
  stdout: string;
  stderr: string;
  manifest: string;
  failure: string;
};

export function resolveProfessorV3SmokeMuldrothaOutputTargetsV2(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV2 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES_V2.failure),
  };
}

function listModelAttemptArtifacts(modelAttemptsDir: string): string[] {
  if (!existsSync(modelAttemptsDir)) return [];
  return readdirSync(modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-"))
    .map((name) => resolve(modelAttemptsDir, name));
}

export function preflightProfessorV3SmokeOutputsAbsentV2(targets: ProfessorV3SmokeOutputTargetsV2): string[] {
  const blocking: string[] = [];
  for (const path of [
    targets.result,
    targets.executionTrace,
    targets.runLedger,
    targets.stdout,
    targets.stderr,
    targets.manifest,
    targets.failure,
  ]) {
    if (existsSync(path)) blocking.push(path);
  }
  if (existsSync(targets.modelAttemptsDir)) {
    blocking.push(targets.modelAttemptsDir);
  }
  blocking.push(...listModelAttemptArtifacts(targets.modelAttemptsDir));
  return blocking;
}

export function assertProfessorV3SmokeOutputsAbsentV2(targets: ProfessorV3SmokeOutputTargetsV2): void {
  const blocking = preflightProfessorV3SmokeOutputsAbsentV2(targets);
  if (blocking.length > 0) {
    throw new Error(
      `FAIL_CLOSED: smoke output targets already exist and must not be overwritten: ${blocking.join(", ")}`,
    );
  }
}

export function createProfessorV3ModelAttemptsDirV2(modelAttemptsDir: string): void {
  if (existsSync(modelAttemptsDir)) {
    throw new Error(`FAIL_CLOSED: modelAttemptsDir already exists: ${modelAttemptsDir}`);
  }
  mkdirSync(modelAttemptsDir, { recursive: false });
}
