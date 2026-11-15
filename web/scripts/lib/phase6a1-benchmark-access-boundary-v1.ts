/**
 * Fail-closed implementation/authority access boundary for benchmark private material.
 * Implementation operational scripts must not read authority-private paths even if present on disk.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type BenchmarkAccessRole = "implementation" | "authority";

export const AUTHORITY_PRIVATE_GITIGNORE_PATTERN = "benchmark-authority/**/private/";

export const PROTECTED_AUTHORITY_PRIVATE_REL_PATHS = [
  "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/phase6a1-professor-plan-prospective-commander-roster-private-v2.json",
  "benchmark-authority/phase6a1-holdout-prospective-pipeline-v1/private/phase6a1-professor-plan-prospective-commander-roster-v2-public-pointer.json",
  "benchmark-authority/phase6a1-holdout-prospective-v7/private/holdout-v7-adjudication-decisions.json",
  "benchmark-authority/phase6a1-holdout-prospective-v7/private/phase6a1-holdout-prospective-v7-blinded-adjudication-sealed-v7.json",
  "benchmark-authority/phase6a1-holdout-prospective-v8/private/holdout-v8-adjudication-decisions.json",
  "benchmark-authority/phase6a1-holdout-prospective-v8/private/phase6a1-holdout-prospective-v8-blinded-adjudication-sealed-v8.json",
  "benchmark-authority/phase6a1-holdout-prospective-v8/private/fixture-catalog/holdout-prospective-v8-N01.json",
] as const;

export function resolveBenchmarkAccessRoleFromEnv(): BenchmarkAccessRole {
  const raw = process.env.PHASE6A1_BENCHMARK_ACCESS_ROLE?.trim();
  if (raw === "authority") return "authority";
  return "implementation";
}

export function assertImplementationCannotReadAuthorityPrivate(absPath: string): void {
  if (absPath.replace(/\\/g, "/").includes("/private/") && absPath.replace(/\\/g, "/").includes("benchmark-authority/")) {
    throw new Error(
      `FAIL_CLOSED: implementation role cannot read authority-private path: ${absPath}. Authority-private material must remain outside the implementation operational boundary.`,
    );
  }
}

export function readFileWithBenchmarkAccessBoundary(
  repoRoot: string,
  relPath: string,
  role: BenchmarkAccessRole = resolveBenchmarkAccessRoleFromEnv(),
): Buffer {
  const absPath = resolve(repoRoot, relPath);
  if (role === "implementation") {
    assertImplementationCannotReadAuthorityPrivate(absPath);
  }
  if (!existsSync(absPath)) {
    const err = new Error(`ENOENT: ${absPath}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  }
  return readFileSync(absPath);
}
