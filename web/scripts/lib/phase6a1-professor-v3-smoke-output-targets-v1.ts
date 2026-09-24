/**
 * Write-once output targets for one real Muldrotha Professor v3 smoke run.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";
import { resolveProfessorV3ModelAttemptsDir } from "./phase6a1-professor-v3-model-attempt-artifacts-v1";

export const PROFESSOR_V3_SMOKE_OUTPUT_TARGETS_V1_VERSION = "phase6a1-professor-v3-smoke-output-targets-v1";

export const PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES = {
  result: "phase6a1-professor-v3-smoke-muldrotha-result-v1.json",
  executionTrace: "phase6a1-professor-v3-smoke-muldrotha-execution-trace-v1.json",
  runLedger: "phase6a1-professor-v3-smoke-muldrotha-run-ledger-v1.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-muldrotha-model-attempts-v1",
  stdout: "phase6a1-professor-v3-smoke-muldrotha-stdout-v1.txt",
  stderr: "phase6a1-professor-v3-smoke-muldrotha-stderr-v1.txt",
  manifest: "phase6a1-professor-v3-smoke-muldrotha-manifest-v1.json",
  readinessReport: "phase6a1-professor-v3-smoke-readiness-report-v1.json",
} as const;

export type ProfessorV3SmokeOutputTargetsV1 = {
  milestonesDir: string;
  result: string;
  executionTrace: string;
  runLedger: string;
  modelAttemptsDir: string;
  stdout: string;
  stderr: string;
  manifest: string;
};

export function resolveProfessorV3SmokeMuldrothaOutputTargets(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV1 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES.runLedger),
    modelAttemptsDir: resolveProfessorV3ModelAttemptsDir(milestonesDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES.manifest),
  };
}

export function preflightProfessorV3SmokeOutputsAbsent(targets: ProfessorV3SmokeOutputTargetsV1): string[] {
  const paths = [
    targets.result,
    targets.executionTrace,
    targets.runLedger,
    targets.stdout,
    targets.stderr,
    targets.manifest,
  ];
  return paths.filter((p) => existsSync(p));
}
