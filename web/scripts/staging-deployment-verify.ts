/**
 * Shared staging deployment lock + identity verification for eval scripts.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVALUATION_SUITE_VERSION,
  SIMPLE_CLERK_VERSION,
} from "../src/lib/deployment-identity";

export interface StagingDeploymentLock {
  gitCommitSha: string;
  gitTreeState: string;
  buildContextHash: string;
  imageTag: string;
  imageDigest: string;
  buildId: string;
  cloudRunRevision: string;
  deployedAt: string;
  simpleClerkVersion: string;
  evaluationSuiteVersion: string;
  goldenCatalogVersion?: string;
  commanderEligibilityVersion?: string;
  stagingUrl: string;
}

export interface StagingDeploymentIdentity {
  gitCommitSha: string;
  gitTreeState: string;
  buildContextHash: string;
  imageDigest: string;
  cloudBuildId: string;
  deployedAt: string;
  simpleClerkVersion: string;
  evaluationSuiteVersion: string;
  goldenCatalogVersion: string;
  commanderEligibilityVersion: string;
}

const LOCK_PATH = join(__dirname, ".staging-deployment-lock.json");

export function loadStagingDeploymentLock(): StagingDeploymentLock | null {
  if (!existsSync(LOCK_PATH)) return null;
  const raw = readFileSync(LOCK_PATH, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as StagingDeploymentLock;
}

export async function fetchStagingDeploymentIdentity(
  baseUrl: string,
): Promise<StagingDeploymentIdentity> {
  const res = await fetch(`${baseUrl}/api/internal/deployment-identity`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch deployment identity: HTTP ${res.status} from ${baseUrl}`,
    );
  }
  return (await res.json()) as StagingDeploymentIdentity;
}

export function expectedVersions() {
  return {
    simpleClerkVersion:
      process.env.EXPECTED_SIMPLE_CLERK_VERSION?.trim() ||
      SIMPLE_CLERK_VERSION,
    evaluationSuiteVersion:
      process.env.EXPECTED_EVALUATION_SUITE_VERSION?.trim() ||
      EVALUATION_SUITE_VERSION,
    gitCommitSha: process.env.EXPECTED_GIT_COMMIT_SHA?.trim() || null,
  };
}

export async function assertStagingDeploymentIdentity(input: {
  baseUrl: string;
}): Promise<{ lock: StagingDeploymentLock | null; identity: StagingDeploymentIdentity }> {
  const identity = await fetchStagingDeploymentIdentity(input.baseUrl);
  const lock = loadStagingDeploymentLock();
  const expected = expectedVersions();

  const mismatches: string[] = [];

  if (identity.gitTreeState !== "clean") {
    mismatches.push(
      `gitTreeState: expected clean, got ${identity.gitTreeState}`,
    );
  }

  if (lock?.buildContextHash && identity.buildContextHash !== lock.buildContextHash) {
    mismatches.push(
      `buildContextHash: expected ${lock.buildContextHash}, got ${identity.buildContextHash}`,
    );
  }

  if (identity.simpleClerkVersion !== expected.simpleClerkVersion) {
    mismatches.push(
      `simpleClerkVersion: expected ${expected.simpleClerkVersion}, got ${identity.simpleClerkVersion}`,
    );
  }
  if (identity.evaluationSuiteVersion !== expected.evaluationSuiteVersion) {
    mismatches.push(
      `evaluationSuiteVersion: expected ${expected.evaluationSuiteVersion}, got ${identity.evaluationSuiteVersion}`,
    );
  }

  const expectedSha =
    lock?.gitCommitSha ?? expected.gitCommitSha ?? process.env.GIT_COMMIT_SHA;
  if (expectedSha && identity.gitCommitSha !== expectedSha) {
    mismatches.push(
      `gitCommitSha: expected ${expectedSha}, got ${identity.gitCommitSha}`,
    );
  }

  if (lock?.imageDigest && identity.imageDigest !== "unknown") {
    if (identity.imageDigest !== lock.imageDigest) {
      mismatches.push(
        `imageDigest: expected ${lock.imageDigest}, got ${identity.imageDigest}`,
      );
    }
  }

  if (identity.gitCommitSha === "unknown") {
    mismatches.push("gitCommitSha is unknown — stale or local image likely running");
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Staging deployment identity mismatch:\n  ${mismatches.join("\n  ")}\nRefuse to run evaluation against wrong image.`,
    );
  }

  return { lock, identity };
}

export function writeStagingDeploymentLock(lock: StagingDeploymentLock): void {
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n", "utf8");
}
