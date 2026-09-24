/**
 * Write-once output preflight for Professor v3 Muldrotha successor smoke v3.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V3_SMOKE_OUTPUT_TARGETS_V5_VERSION = "phase6a1-professor-v3-smoke-output-targets-v5";

export const PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3 = {
  result: "phase6a1-professor-v3-smoke-muldrotha-successor-result-v3.json",
  executionTrace: "phase6a1-professor-v3-smoke-muldrotha-successor-execution-trace-v3.json",
  runLedger: "phase6a1-professor-v3-smoke-muldrotha-successor-run-ledger-v3.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v3",
  stdout: "phase6a1-professor-v3-smoke-muldrotha-successor-stdout-v3.txt",
  stderr: "phase6a1-professor-v3-smoke-muldrotha-successor-stderr-v3.txt",
  manifest: "phase6a1-professor-v3-smoke-muldrotha-successor-manifest-v3.json",
  failure: "phase6a1-professor-v3-smoke-muldrotha-successor-failure-v3.json",
} as const;

export type ProfessorV3SmokeOutputTargetsV5 = {
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

export function resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV3(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV5 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_SUCCESSOR_ARTIFACT_BASENAMES_V3.failure),
  };
}

function listModelAttemptArtifacts(modelAttemptsDir: string): string[] {
  if (!existsSync(modelAttemptsDir)) return [];
  return readdirSync(modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-"))
    .map((name) => resolve(modelAttemptsDir, name));
}

export function preflightProfessorV3SmokeOutputsAbsentV5(targets: ProfessorV3SmokeOutputTargetsV5): string[] {
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

export function assertProfessorV3SmokeOutputsAbsentV5(targets: ProfessorV3SmokeOutputTargetsV5): void {
  const blocking = preflightProfessorV3SmokeOutputsAbsentV5(targets);
  if (blocking.length > 0) {
    throw new Error(
      `FAIL_CLOSED: successor smoke v3 output targets already exist and must not be overwritten: ${blocking.join(", ")}`,
    );
  }
}

export function createProfessorV3ModelAttemptsDirV5(modelAttemptsDir: string): void {
  if (existsSync(modelAttemptsDir)) {
    throw new Error(`FAIL_CLOSED: modelAttemptsDir already exists: ${modelAttemptsDir}`);
  }
  mkdirSync(modelAttemptsDir, { recursive: false });
}
