/**
 * Fail-closed artifact output routing for serialization pilot — writable mount only in container.
 */
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO } from "./phase6a1-pinned-implementation-container-v1";
import { PILOT_PASS_ARTIFACT } from "./phase6a1-serialization-pilot-v8-config-v1";

export const SERIALIZATION_PILOT_ARTIFACT_ROUTING_V1_VERSION = "phase6a1-serialization-pilot-artifact-routing-v1";

export function resolvePilotArtifactOutputDir(): string {
  const fromEnv = process.env.PHASE6A1_ARTIFACT_OUTPUT_DIR?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1") {
    throw new Error("FAIL_CLOSED: PHASE6A1_ARTIFACT_OUTPUT_DIR required inside implementation container");
  }
  return resolve(MILESTONES, ".serialization-pilot-v8-out");
}

export function ensurePilotArtifactOutputDir(): string {
  const dir = resolvePilotArtifactOutputDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function pilotPassArtifactPath(): string {
  return resolve(ensurePilotArtifactOutputDir(), PILOT_PASS_ARTIFACT);
}

export function pilotCaseEvidenceDir(pilotCaseId: string): string {
  const dir = resolve(ensurePilotArtifactOutputDir(), "cases", pilotCaseId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function assertPassArtifactAbsentForExecution(): void {
  const passPath = pilotPassArtifactPath();
  if (existsSync(passPath)) {
    throw new Error(`FAIL_CLOSED: existing PASS artifact blocks execution: ${passPath}`);
  }
}

export function assertWritableArtifactMount(): void {
  if (process.env.PHASE6A1_IMPLEMENTATION_CONTAINER === "1") {
    const dir = process.env.PHASE6A1_ARTIFACT_OUTPUT_DIR?.trim();
    if (!dir || dir === "/implementation" || dir.startsWith("/implementation/")) {
      throw new Error("FAIL_CLOSED: pilot evidence must write to dedicated /artifact-out mount");
    }
  }
}

export const HOST_MILESTONES_DIR = MILESTONES;
export const HOST_REPO_ROOT = REPO;
