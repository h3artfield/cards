/**
 * Write-once output preflight for Professor v3 Korvold prospective smoke v1.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V3_SMOKE_OUTPUT_TARGETS_V6_VERSION = "phase6a1-professor-v3-smoke-output-targets-v6";

export const PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1 = {
  result: "phase6a1-professor-v3-smoke-korvold-prospective-result-v1.json",
  executionTrace: "phase6a1-professor-v3-smoke-korvold-prospective-execution-trace-v1.json",
  runLedger: "phase6a1-professor-v3-smoke-korvold-prospective-run-ledger-v1.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-korvold-prospective-model-attempts-v1",
  stdout: "phase6a1-professor-v3-smoke-korvold-prospective-stdout-v1.txt",
  stderr: "phase6a1-professor-v3-smoke-korvold-prospective-stderr-v1.txt",
  manifest: "phase6a1-professor-v3-smoke-korvold-prospective-manifest-v1.json",
  failure: "phase6a1-professor-v3-smoke-korvold-prospective-failure-v1.json",
} as const;

export type ProfessorV3SmokeOutputTargetsV6 = {
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

export function resolveProfessorV3SmokeKorvoldProspectiveOutputTargetsV1(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV6 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_KORVOLD_PROSPECTIVE_ARTIFACT_BASENAMES_V1.failure),
  };
}

function listModelAttemptArtifacts(modelAttemptsDir: string): string[] {
  if (!existsSync(modelAttemptsDir)) return [];
  return readdirSync(modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-"))
    .map((name) => resolve(modelAttemptsDir, name));
}

export function preflightProfessorV3SmokeOutputsAbsentV6(targets: ProfessorV3SmokeOutputTargetsV6): string[] {
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

export function assertProfessorV3SmokeOutputsAbsentV6(targets: ProfessorV3SmokeOutputTargetsV6): void {
  const blocking = preflightProfessorV3SmokeOutputsAbsentV6(targets);
  if (blocking.length > 0) {
    throw new Error(
      `FAIL_CLOSED: Korvold prospective smoke output targets already exist and must not be overwritten: ${blocking.join(", ")}`,
    );
  }
}

export function createProfessorV3ModelAttemptsDirV6(modelAttemptsDir: string): void {
  if (existsSync(modelAttemptsDir)) {
    throw new Error(`FAIL_CLOSED: modelAttemptsDir already exists: ${modelAttemptsDir}`);
  }
  mkdirSync(modelAttemptsDir, { recursive: false });
}

export const PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1 = {
  result: "phase6a1-professor-v3-smoke-yuriko-prospective-result-v1.json",
  executionTrace: "phase6a1-professor-v3-smoke-yuriko-prospective-execution-trace-v1.json",
  runLedger: "phase6a1-professor-v3-smoke-yuriko-prospective-run-ledger-v1.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-yuriko-prospective-model-attempts-v1",
  stdout: "phase6a1-professor-v3-smoke-yuriko-prospective-stdout-v1.txt",
  stderr: "phase6a1-professor-v3-smoke-yuriko-prospective-stderr-v1.txt",
  manifest: "phase6a1-professor-v3-smoke-yuriko-prospective-manifest-v1.json",
  failure: "phase6a1-professor-v3-smoke-yuriko-prospective-failure-v1.json",
} as const;

export function resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV6 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_YURIKO_PROSPECTIVE_ARTIFACT_BASENAMES_V1.failure),
  };
}

export function assertProfessorV3YurikoSmokeOutputsAbsentV1(targets: ProfessorV3SmokeOutputTargetsV6): void {
  const blocking = preflightProfessorV3SmokeOutputsAbsentV6(targets);
  if (blocking.length > 0) {
    throw new Error(
      `FAIL_CLOSED: Yuriko prospective smoke output targets already exist and must not be overwritten: ${blocking.join(", ")}`,
    );
  }
}

export const PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1 = {
  result: "phase6a1-professor-v3-smoke-zada-prospective-result-v1.json",
  executionTrace: "phase6a1-professor-v3-smoke-zada-prospective-execution-trace-v1.json",
  runLedger: "phase6a1-professor-v3-smoke-zada-prospective-run-ledger-v1.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-zada-prospective-model-attempts-v1",
  stdout: "phase6a1-professor-v3-smoke-zada-prospective-stdout-v1.txt",
  stderr: "phase6a1-professor-v3-smoke-zada-prospective-stderr-v1.txt",
  manifest: "phase6a1-professor-v3-smoke-zada-prospective-manifest-v1.json",
  failure: "phase6a1-professor-v3-smoke-zada-prospective-failure-v1.json",
} as const;

export function resolveProfessorV3SmokeZadaProspectiveOutputTargetsV1(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV6 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_ZADA_PROSPECTIVE_ARTIFACT_BASENAMES_V1.failure),
  };
}

export const PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1 = {
  result: "phase6a1-professor-v3-smoke-chatterfang-prospective-result-v1.json",
  executionTrace: "phase6a1-professor-v3-smoke-chatterfang-prospective-execution-trace-v1.json",
  runLedger: "phase6a1-professor-v3-smoke-chatterfang-prospective-run-ledger-v1.json",
  modelAttemptsDir: "phase6a1-professor-v3-smoke-chatterfang-prospective-model-attempts-v1",
  stdout: "phase6a1-professor-v3-smoke-chatterfang-prospective-stdout-v1.txt",
  stderr: "phase6a1-professor-v3-smoke-chatterfang-prospective-stderr-v1.txt",
  manifest: "phase6a1-professor-v3-smoke-chatterfang-prospective-manifest-v1.json",
  failure: "phase6a1-professor-v3-smoke-chatterfang-prospective-failure-v1.json",
} as const;

export function resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1(
  milestonesDir: string = MILESTONES,
): ProfessorV3SmokeOutputTargetsV6 {
  return {
    milestonesDir,
    result: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.result),
    executionTrace: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.executionTrace),
    runLedger: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.runLedger),
    modelAttemptsDir: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.modelAttemptsDir),
    stdout: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stdout),
    stderr: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.stderr),
    manifest: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.manifest),
    failure: resolve(milestonesDir, PROFESSOR_V3_SMOKE_CHATTERFANG_PROSPECTIVE_ARTIFACT_BASENAMES_V1.failure),
  };
}

export function assertProfessorV3ChatterfangSmokeOutputsAbsentV1(targets: ProfessorV3SmokeOutputTargetsV6): void {
  const blocking = preflightProfessorV3SmokeOutputsAbsentV6(targets);
  if (blocking.length > 0) {
    throw new Error(
      `FAIL_CLOSED: Chatterfang prospective smoke output targets already exist and must not be overwritten: ${blocking.join(", ")}`,
    );
  }
}
