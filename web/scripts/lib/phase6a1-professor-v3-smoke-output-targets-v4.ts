/**
 * Write-once output preflight for Professor v3 Muldrotha successor smoke v2.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V3_SMOKE_OUTPUT_TARGETS_V4_VERSION = "phase6a1-professor-v3-smoke-output-targets-v4";

export const PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2 = {
  result: "phase6a1-professor-v3-smoke-muldrotha-successor-result-v2.json",
  executionTrace: "phase6a1-professor-v3-smoke-muldrotha-successor-execution-trace-v2.json",
  runLedger: "phase6a1-professor-v3-smoke-muldrotha-successor-run-ledger-v2.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v2",
  stdout: "phase6a1-professor-v3-smoke-muldrotha-successor-stdout-v2.txt",
  stderr: "phase6a1-professor-v3-smoke-muldrotha-successor-stderr-v2.txt",
  manifest: "phase6a1-professor-v3-smoke-muldrotha-successor-manifest-v2.json",
  failure: "phase6a1-professor-v3-smoke-muldrotha-successor-failure-v2.json",
} as const;

export type ProfessorV3SmokeOutputTargetsV4 = {
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

export function resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV2(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV4 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V2.failure),
  };
}

function listModelAttemptArtifacts(modelAttemptsDir: string): string[] {
  if (!existsSync(modelAttemptsDir)) return [];
  return readdirSync(modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-"))
    .map((name) => resolve(modelAttemptsDir, name));
}

export function preflightProfessorV3SmokeOutputsAbsentV4(targets: ProfessorV3SmokeOutputTargetsV4): string[] {
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
  if (existsSync(targets.modelAttemptsDir)) blocking.push(targets.modelAttemptsDir);
  blocking.push(...listModelAttemptArtifacts(targets.modelAttemptsDir));
  return blocking;
}

export function assertProfessorV3SmokeOutputsAbsentV4(targets: ProfessorV3SmokeOutputTargetsV4): void {
  const blocking = preflightProfessorV3SmokeOutputsAbsentV4(targets);
  if (blocking.length > 0) {
    throw new Error(
      `FAIL_CLOSED: successor smoke v2 output targets already exist and must not be overwritten: ${blocking.join(", ")}`,
    );
  }
}

export function createProfessorV3ModelAttemptsDirV4(modelAttemptsDir: string): void {
  if (existsSync(modelAttemptsDir)) {
    throw new Error(`FAIL_CLOSED: modelAttemptsDir already exists: ${modelAttemptsDir}`);
  }
  mkdirSync(modelAttemptsDir, { recursive: false });
}
